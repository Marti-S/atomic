"""CPU-only compatibility contract. Importing this module never loads a model."""
from dataclasses import dataclass
import hashlib
import json
import math

DECIDER_REVISION = 'a59466dc52f3ad5cc75758f80a4fa0109fd56b08'
RENDERING_VERSION = 'atomic-decider-state-first-v1'
QUESTION_VERSION = 'investigate-next-action-v1'
CANDIDATE_POLICY_VERSION = 'code-investigation-v1'
PRECISION = 'decider-four-decimal'
MAX_REQUEST_BYTES = 65536
MAX_STATE_BYTES = 32768
MAX_TOTAL_TOKENS = 8192
MAX_OPTIONS = 33

class ContractError(Exception):
    """Only static codes cross HTTP. Never include a caller value or exception cause."""
    def __init__(self, code, status=422):
        self.code, self.status = code, status
        super().__init__(code)


def pairs_unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ContractError('decision_invalid')
        result[key] = value
    return result


def finite_number(text):
    value = float(text)
    if not math.isfinite(value):
        raise ContractError('decision_invalid')
    return value


def strict_json(raw):
    try:
        return json.loads(raw, object_pairs_hook=pairs_unique, parse_float=finite_number,
                          parse_constant=lambda _: (_ for _ in ()).throw(ContractError('decision_invalid')))
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise ContractError('decision_invalid') from None


def compact(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'), sort_keys=True).encode('utf-8')


def digest(value):
    return hashlib.sha256(compact(value)).hexdigest()


def exact(value, keys):
    return isinstance(value, dict) and set(value) == set(keys)


def request_contract(raw, identity):
    if len(raw) > MAX_REQUEST_BYTES:
        raise ContractError('context_limit')
    body = strict_json(raw)
    if not exact(body, ('model', 'state', 'questions', 'independent', 'layout', 'deploymentFingerprint')):
        raise ContractError('decision_invalid')
    if body['model'] != identity['backendId'] or body['deploymentFingerprint'] != identity['deploymentFingerprint']:
        raise ContractError('model_mismatch')
    if body['independent'] is not True or body['layout'] != 'state_first':
        raise ContractError('decision_invalid')
    state, questions = body['state'], body['questions']
    if not isinstance(state, dict) or not state or len(compact(state)) > MAX_STATE_BYTES:
        raise ContractError('context_limit')
    if not isinstance(questions, dict) or len(questions) != 1:
        raise ContractError('decision_invalid')
    for question_id, question in questions.items():
        if not question_id.strip() or not exact(question, ('type', 'instructions', 'criteria')) or question['type'] != 'choice':
            raise ContractError('decision_invalid')
        if not isinstance(question['instructions'], str) or not question['instructions'].strip():
            raise ContractError('decision_invalid')
        options = question['criteria']
        if not isinstance(options, dict) or not 2 <= len(options) <= MAX_OPTIONS:
            raise ContractError('decision_invalid')
        if any(not key.strip() or not isinstance(value, str) or not value.strip() for key, value in options.items()):
            raise ContractError('decision_invalid')
    return body


def exact_state_first_item(tokenizer, context, question, options, label_table, token_limit=MAX_TOTAL_TOKENS):
    """Pinned narrow/wide layout, WITHOUT the upstream state slicing path.

    The returned object itself is passed to scoring. Token count includes all
    state, options, formatting, and the answer slot. No second preparation pass.
    """
    if type(token_limit) is not int or not 0 < token_limit <= MAX_TOTAL_TOKENS:
        raise ContractError('model_mismatch')
    if not 2 <= len(options) <= MAX_OPTIONS:
        raise ContractError('decision_invalid')
    encode = lambda text: tokenizer.encode(text, add_special_tokens=False)
    ids = list(encode('Context:\n' + context))
    if len(ids) > token_limit:
        raise ContractError('context_limit')
    head, tail = '\n\nQuestion: ' + question + '\nOptions:', '\nAnswer: ('
    if len(options) <= 10:
        piece = encode(head + ''.join(f'\n({chr(65 + i)}) {option}' for i, option in enumerate(options)) + tail)
    else:
        _, labels, open_ids = label_table(tokenizer)
        piece = list(encode(head))
        for i, option in enumerate(options):
            piece.extend(open_ids)
            piece.append(labels[i])
            piece.extend(encode(') ' + option))
        piece.extend(encode(tail))
    ids.extend(piece)
    if len(ids) > token_limit:
        raise ContractError('context_limit')
    return dict(ids=ids, slots=[len(ids) - 1], golds=[0], nopts=[len(options)], perms=[list(range(len(options)))])


def validate_probabilities(values, count):
    if len(values) != count or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 1 for v in values):
        raise ContractError('decision_invalid', 503)
    total = sum(values)
    if total <= 0 or abs(total - 1) > 1e-5:
        raise ContractError('decision_invalid', 503)
    return [value / total for value in values]


@dataclass(frozen=True)
class Prepared:
    question_id: str
    rendered_question: dict
    item: dict
