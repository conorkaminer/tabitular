#!/usr/bin/env python3
import argparse, errno, json
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote
from tbt import parse, midi, create_tbt
ROOT=Path(__file__).parent
DIST=ROOT/'dist'
class Handler(BaseHTTPRequestHandler):
    def send(self,status,body,kind):
        self.send_response(status); self.send_header('Content-Type',kind); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        path=self.path.split('?')[0]
        if path=='/config.json':
            self.send(200,json.dumps({'sampleUrl':'api/sample' if self.server.sample else None}).encode(),'application/json'); return
        if path=='/api/sample-midi':
            try: self.send(200,midi(parse(Path(self.server.sample).read_bytes())),'audio/midi')
            except Exception: self.send(400,b'Example unavailable','text/plain')
            return
        if path=='/api/sample':
            try: self.send(200,json.dumps(parse(Path(self.server.sample).read_bytes(),Path(self.server.sample).name)).encode(),'application/json')
            except Exception as e: self.send(404,json.dumps({'error':str(e)}).encode(),'application/json')
            return
        if path.startswith('/soundbanks/'):
            filename=path.removeprefix('/soundbanks/')
            target=ROOT/'public'/'soundbanks'/filename
            if '/' in filename or '\\' in filename or not filename.endswith(('.json','.txt')) or not target.is_file():
                self.send(404,b'Not found','text/plain'); return
            self.send(200,target.read_bytes(),'application/json' if filename.endswith('.json') else 'text/plain; charset=utf-8'); return
        if not DIST.is_dir():
            self.send(503,b'Frontend build missing. Run npm install and npm run build.','text/plain; charset=utf-8'); return
        relative='index.html' if path=='/' else path.lstrip('/')
        target=(DIST/relative).resolve()
        if not target.is_relative_to(DIST.resolve()) or not target.is_file():
            self.send(404,b'Not found','text/plain'); return
        kind={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.woff':'font/woff','.woff2':'font/woff2'}.get(target.suffix,'application/octet-stream')
        self.send(200,target.read_bytes(),kind)
    def do_POST(self):
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 1<=size<=5_000_000: raise ValueError('Choose a .tbt file smaller than 5 MB')
            data=self.rfile.read(size)
            if self.path=='/api/create-tbt':
                self.send(200,create_tbt(json.loads(data)),'application/octet-stream'); return
            song=parse(data,unquote(self.headers.get('X-Filename','Untitled.tbt')))
            if self.path=='/api/midi': self.send(200,midi(song),'audio/midi')
            elif self.path=='/api/parse': self.send(200,json.dumps(song).encode(),'application/json')
            else: self.send(404,b'Not found','text/plain')
        except (ValueError,IndexError,OverflowError) as e: self.send(400,json.dumps({'error':str(e)}).encode(),'application/json')
        except Exception: self.send(400,b'{"error":"Unable to decode this TabIt file"}','application/json')
if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--port',type=int,default=8765); p.add_argument('--sample'); args=p.parse_args()
    try:
        http=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    except OSError as e:
        if e.errno != errno.EADDRINUSE: raise
        p.exit(1,f'Port {args.port} is already in use. If Tabit is already running, open http://127.0.0.1:{args.port}. Otherwise, choose another port: python3 server.py --port {args.port+1}\n')
    http.sample=args.sample
    print(f'Tabit ready at http://127.0.0.1:{args.port}',flush=True); http.serve_forever()
