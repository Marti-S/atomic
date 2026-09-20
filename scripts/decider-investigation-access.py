#!/usr/bin/env python3
"""Atomic's fixed, read-only Linux openat2 accessor. No shell, imports from the repo, or writes.

stdin/stdout are a private JSON-lines protocol. The host dispatches every content
operation through canonical tool hooks before it can reach this process. The
interpreter is run with -I and a minimal, credential-free environment.
"""
import ctypes
import errno
import hashlib
import json
import os
import platform
import stat
import sys

MAXIMA = dict(maxFileBytes=1048576, maxEnumeratedEntries=5000,
              maxScannedBytes=16777216, maxReadLines=120,
              maxReadBytes=6144, maxSearchMatches=20, maxEvidenceBytes=24576)
EXCLUDED = {'.git', '.hg', '.svn', '.env', '.ssh', '.aws', '.azure', '.gnupg',
            '.kube', '.docker', 'node_modules', 'vendor', '.venv', 'venv',
            '__pycache__', 'dist', 'build', 'target', '.next', '.cache', 'coverage'}
BINARY_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf',
                     '.zip', '.gz', '.tar', '.7z', '.exe', '.dll', '.so', '.dylib',
                     '.sqlite', '.db', '.woff', '.woff2', '.ttf', '.mp4', '.mp3', '.pyc'}

class Failure(Exception):
    def __init__(self, code):
        self.code = code

class OpenHow(ctypes.Structure):
    _fields_ = [('flags', ctypes.c_uint64), ('mode', ctypes.c_uint64), ('resolve', ctypes.c_uint64)]

LIBC = ctypes.CDLL(None, use_errno=True)
LIBC.syscall.restype = ctypes.c_long

def open_beneath(fd, path, flags, no_xdev=True):
    if sys.platform != 'linux' or platform.machine() not in ('x86_64', 'aarch64'):
        raise Failure('unsupported_platform')
    how = OpenHow(flags | os.O_CLOEXEC | os.O_NOFOLLOW | (0 if flags & os.O_PATH else os.O_NONBLOCK), 0,
                  0x08 | 0x04 | 0x02 | (0x01 if no_xdev else 0))
    result = LIBC.syscall(437, fd, ctypes.c_char_p(os.fsencode(path)), ctypes.byref(how), ctypes.sizeof(how))
    if result < 0:
        error = ctypes.get_errno()
        if error in (errno.ENOSYS, errno.EINVAL):
            raise Failure('unsupported_platform')
        if error in (errno.ENOENT, errno.ESTALE):
            raise Failure('source_changed')
        raise Failure('permission_denied')
    return int(result)

def version(st):
    return ':'.join(str(v) for v in (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns))

def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True)

def emit(value):
    sys.stdout.write(dump(value) + '\n')
    sys.stdout.flush()

def relative_path(value):
    if not isinstance(value, str) or not value or len(value.encode()) > 4096 or value.startswith('/'):
        raise Failure('permission_denied')
    if any(c in value for c in '\\:\x00*?[]{}') or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise Failure('permission_denied')
    if any(part in ('', '.', '..') for part in value.split('/')):
        raise Failure('permission_denied')
    return value

def default_excluded(path):
    import re
    for part in path.split('/'):
        if part in EXCLUDED or re.fullmatch(r'(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.pypirc|auth\.json|credentials(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|.*\.(?:pem|key|p12|pfx|jks|keystore))', part, re.I):
            return True
    return os.path.splitext(path)[1].lower() in BINARY_EXTENSIONS

def root_open(path):
    if not isinstance(path, str) or not path.startswith('/') or '\x00' in path:
        raise Failure('permission_denied')
    fd = os.open('/', os.O_PATH | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        for part in path.split('/')[1:]:
            if not part:
                continue
            if part in ('.', '..'):
                raise Failure('permission_denied')
            nxt = open_beneath(fd, part, os.O_PATH | os.O_DIRECTORY, no_xdev=False)
            os.close(fd)
            fd = nxt
        return fd
    except BaseException:
        os.close(fd)
        raise

def lines_of(text):
    lines = text.split('\n')
    return [line + '\n' for line in lines[:-1]] + ([lines[-1]] if lines[-1] else [])

class Accessor:
    def __init__(self, request):
        self.root_path = request['root']
        self.root = root_open(self.root_path)
        self.root_identity = (os.fstat(self.root).st_dev, os.fstat(self.root).st_ino)
        # Feature test before any enumeration; kernels without openat2 fail closed.
        probe = open_beneath(self.root, '.', os.O_PATH | os.O_DIRECTORY)
        os.close(probe)
        self.paths = request['scopePaths']
        self.excludes = request['excludedPaths']
        if not isinstance(self.paths, list) or not self.paths or not isinstance(self.excludes, list):
            raise Failure('permission_denied')
        for path in self.paths:
            if path != '.':
                relative_path(path)
        for path in self.excludes:
            relative_path(path)
        self.limits = {}
        for key, cap in MAXIMA.items():
            v = request['limits'].get(key, cap)
            if type(v) is not int or not 0 < v <= cap:
                raise Failure('permission_denied')
            self.limits[key] = v
        self.entries = 0
        self.scanned = 0
        self.files = {}
        self.directories = {}
        self.generation = request['generation']
        self.enumerate()
        self.revision = hashlib.sha256(dump({'files': self.files, 'directories': self.directories, 'generation': self.generation}).encode()).hexdigest()
        self.scope_id = 'scope_' + self.revision[:24]

    def excluded(self, path):
        return default_excluded(path) or any(path == p or path.startswith(p + '/') for p in self.excludes)

    def allowed(self, path):
        return not self.excluded(path) and any(p == '.' or path == p or path.startswith(p + '/') for p in self.paths)

    def traverse(self, path):
        return path == '.' or any(p == '.' or path == p or path.startswith(p + '/') or p.startswith(path + '/') for p in self.paths)

    def enumerate(self):
        stack = ['.']
        while stack:
            path = stack.pop()
            fd = open_beneath(self.root, path, os.O_RDONLY | os.O_DIRECTORY)
            try:
                before = version(os.fstat(fd))
                self.directories[path] = before
                with os.scandir(fd) as iterator:
                    # Sorting is bounded by the same entry budget, not an unmetered listdir.
                    names = []
                    while True:
                        if self.entries >= self.limits['maxEnumeratedEntries']:
                            emit({'type': 'metadata-meter', 'entriesEnumerated': self.entries})
                            raise Failure('context_limit')
                        try:
                            entry = next(iterator)
                        except StopIteration:
                            break
                        self.entries += 1
                        names.append(entry.name)
                    emit({'type': 'metadata-meter', 'entriesEnumerated': self.entries})
                    for name in sorted(names):
                        child = name if path == '.' else path + '/' + name
                        try:
                            relative_path(child)
                        except Failure:
                            continue
                        if self.excluded(child) or not self.traverse(child):
                            continue
                        try:
                            target = open_beneath(self.root, child, os.O_PATH)
                        except Failure as error:
                            if error.code == 'permission_denied':
                                continue  # Never publish symlink/device targets as candidates.
                            raise
                        try:
                            st = os.fstat(target)
                            if stat.S_ISDIR(st.st_mode):
                                stack.append(child)
                            elif stat.S_ISREG(st.st_mode) and self.allowed(child) and st.st_size <= self.limits['maxFileBytes']:
                                self.files[child] = {'version': version(st), 'size': st.st_size}
                        finally:
                            os.close(target)
                if version(os.fstat(fd)) != before:
                    raise Failure('source_changed')
                check = open_beneath(self.root, path, os.O_PATH | os.O_DIRECTORY)
                try:
                    if version(os.fstat(check)) != before:
                        raise Failure('source_changed')
                finally:
                    os.close(check)
            finally:
                os.close(fd)
        self.check()

    def check(self):
        current_root = root_open(self.root_path)
        try:
            st = os.fstat(current_root)
            if (st.st_dev, st.st_ino) != self.root_identity:
                raise Failure('source_changed')
        finally:
            os.close(current_root)
        for path, expected in self.directories.items():
            fd = open_beneath(self.root, path, os.O_PATH | os.O_DIRECTORY)
            try:
                if version(os.fstat(fd)) != expected:
                    raise Failure('source_changed')
            finally:
                os.close(fd)
        for path, info in self.files.items():
            fd = open_beneath(self.root, path, os.O_PATH)
            try:
                st = os.fstat(fd)
                if not stat.S_ISREG(st.st_mode) or version(st) != info['version']:
                    raise Failure('source_changed')
            finally:
                os.close(fd)

    def read_file(self, path, operation_id):
        relative_path(path)
        if path not in self.files or not self.allowed(path):
            raise Failure('permission_denied')
        fd = open_beneath(self.root, path, os.O_RDONLY)
        try:
            st = os.fstat(fd)
            if not stat.S_ISREG(st.st_mode) or st.st_size > self.limits['maxFileBytes']:
                raise Failure('permission_denied')
            before = version(st)
            if before != self.files[path]['version']:
                raise Failure('source_changed')
            if self.scanned + st.st_size > self.limits['maxScannedBytes']:
                raise Failure('scan_limit')
            chunks = []
            left = st.st_size
            while left:
                chunk = os.read(fd, min(65536, left))
                if not chunk:
                    raise Failure('source_changed')
                chunks.append(chunk)
                left -= len(chunk)
                self.scanned += len(chunk)
                emit({'type': 'meter', 'operationId': operation_id, 'path': path, 'bytes': len(chunk), 'totalScannedBytes': self.scanned, 'version': before})
            data = b''.join(chunks)
            if version(os.fstat(fd)) != before:
                raise Failure('source_changed')
            # Check the opened target against a new root-confined resolution, not just a path prefix.
            current = open_beneath(self.root, path, os.O_PATH)
            try:
                if version(os.fstat(current)) != before:
                    raise Failure('source_changed')
            finally:
                os.close(current)
            source = {'path': path, 'version': before, 'contentHash': hashlib.sha256(data).hexdigest(), 'bytesRead': len(data)}
            try:
                text = data.decode('utf-8', errors='strict')
            except UnicodeError:
                return None, source
            if '\x00' in text or any(ord(c) < 9 or 13 < ord(c) < 32 for c in text):
                return None, source
            return text, source
        finally:
            os.close(fd)

    def execute(self, request):
        self.check()
        action = request['action']
        operation_id = request['operationId']
        remaining = request['remainingEvidenceBytes']
        if type(remaining) is not int or not 0 < remaining <= self.limits['maxEvidenceBytes']:
            raise Failure('context_limit')
        if action.get('kind') == 'read_range':
            if set(action) != {'kind', 'path', 'startLine', 'endLine'}:
                raise Failure('permission_denied')
            start, end = action['startLine'], action['endLine']
            if type(start) is not int or type(end) is not int or start <= 0 or end < start or end - start + 1 > self.limits['maxReadLines']:
                raise Failure('permission_denied')
            text, source = self.read_file(action['path'], operation_id)
            if text is None:
                raise Failure('operation_failed')
            lines = lines_of(text)
            selected = ''.join(lines[start - 1:end])
            raw = selected.encode('utf-8')
            cap = min(remaining, self.limits['maxReadBytes'])
            excerpt = raw[:cap].decode('utf-8', errors='ignore')
            complete = len(excerpt.encode('utf-8')) == len(raw)
            count = excerpt.count('\n') + (1 if excerpt and not excerpt.endswith('\n') else 0)
            actual_end = start + count - 1
            covered = actual_end if complete or excerpt.endswith('\n') else actual_end - 1
            result = dict(kind='source_excerpt', text=excerpt, path=action['path'], startLine=start,
                          endLine=actual_end, coveredEndLine=covered,
                          bounded=not complete or start > 1 or end < len(lines),
                          omittedMatches=0, omittedEvidenceBytes=len(raw) - len(excerpt.encode('utf-8')), sources=[source])
        elif action.get('kind') == 'search_literal':
            if set(action) != {'kind', 'term', 'scopeId'} or action['scopeId'] != self.scope_id:
                raise Failure('permission_denied')
            term = action['term']
            if not isinstance(term, str) or not 2 <= len(term) <= 128:
                raise Failure('permission_denied')
            matches, sources = [], []
            complete = True
            omitted_bytes = 0
            for path in sorted(self.files):
                try:
                    text, source = self.read_file(path, operation_id)
                except Failure as error:
                    if error.code == 'scan_limit':
                        complete = False
                        break
                    raise
                sources.append(source)
                if text is None:
                    continue
                lines = lines_of(text)
                offset, previous_line = 0, 0
                while True:
                    index = text.find(term, offset)
                    if index < 0:
                        break
                    offset = index + max(1, len(term))
                    line = text.count('\n', 0, index) + 1
                    if line == previous_line:
                        continue
                    previous_line = line
                    content = lines[line - 1]
                    proposed = {'path': path, 'line': line, 'text': content, 'clipped': False}
                    # The whole factual envelope counts toward the evidence budget, not only line text.
                    candidate_text = dump({'term': term, 'scopeId': self.scope_id, 'matches': matches + [proposed], 'scopeFullyScanned': False})
                    if len(candidate_text.encode()) > remaining:
                        low, high = 0, len(content)
                        while low < high:
                            mid = (low + high + 1) // 2
                            clipped = dict(proposed, text=content[:mid], clipped=True)
                            if len(dump({'term': term, 'scopeId': self.scope_id, 'matches': matches + [clipped], 'scopeFullyScanned': False}).encode()) <= remaining:
                                low = mid
                            else:
                                high = mid - 1
                        if low:
                            proposed = dict(proposed, text=content[:low], clipped=True)
                            matches.append(proposed)
                            omitted_bytes += len(content[low:].encode())
                        else:
                            omitted_bytes += len(content.encode())
                        complete = False
                        break
                    matches.append(proposed)
                    if len(matches) >= self.limits['maxSearchMatches']:
                        complete = False
                        break
                if not complete:
                    break
            result_text = dump({'term': term, 'scopeId': self.scope_id, 'matches': matches, 'scopeFullyScanned': complete})
            if len(result_text.encode()) > remaining:
                raise Failure('context_limit')
            result = dict(kind='search_matches', text=result_text, matches=matches, scopeFullyScanned=complete,
                          bounded=not complete or any(m['clipped'] for m in matches), omittedMatches=0 if complete else None,
                          omittedEvidenceBytes=omitted_bytes, sources=sources)
        else:
            raise Failure('permission_denied')
        self.check()
        return result

    def snapshot(self):
        return dict(id=self.scope_id, revision=self.revision, files=self.files, entriesEnumerated=self.entries,
                    restrictions=dict(readOnly=True, scopePaths=self.paths, excludedPaths=self.excludes,
                                      defaultExclusions=sorted(EXCLUDED), binaryAndOversizedFilesExcluded=True,
                                      symlinksAndMountCrossingsDenied=True, lineConvention='LF (CRLF preserved)'))

def main():
    accessor = None
    while True:
        line = sys.stdin.buffer.readline(65537)
        if not line:
            break
        request_id = None
        try:
            if len(line) > 65536:
                raise Failure('context_limit')
            request = json.loads(line)
            request_id = request['id']
            command = request['command']
            if command == 'probe':
                root = root_open('/')
                try:
                    fd = open_beneath(root, '.', os.O_PATH | os.O_DIRECTORY)
                    os.close(fd)
                finally:
                    os.close(root)
                result = {'supported': True}
            elif command == 'init' and accessor is None:
                accessor = Accessor(request)
                result = accessor.snapshot()
            elif command == 'check' and accessor is not None:
                accessor.check()
                result = {'fresh': True}
            elif command == 'execute' and accessor is not None:
                result = accessor.execute(request)
            else:
                raise Failure('permission_denied')
            emit({'type': 'result', 'id': request_id, 'result': result})
        except Failure as error:
            code = 'context_limit' if error.code == 'scan_limit' else error.code
            emit({'type': 'error', 'id': request_id, 'code': code})
        except BaseException:
            # Never emit exception messages, filenames from the OS, bodies or credentials.
            emit({'type': 'error', 'id': request_id, 'code': 'operation_failed'})
    if accessor is not None:
        os.close(accessor.root)

if __name__ == '__main__':
    main()
