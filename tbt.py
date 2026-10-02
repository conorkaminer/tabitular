"""TabIt reader. Format reference: https://bostick.github.io/tabit-file-format/"""
import struct, zlib

class Reader:
    def __init__(self, data): self.data, self.pos = data, 0
    def read(self,n):
        if n < 0 or self.pos+n > len(self.data): raise ValueError('Truncated TabIt data')
        result=self.data[self.pos:self.pos+n]; self.pos+=n; return result
    def num(self,n=1): return int.from_bytes(self.read(n),'little')
    def string(self): return self.read(self.num(2)).decode('cp1252',errors='replace')
    def runs(self, size):
        out=bytearray()
        while len(out)<size:
            chunk=Reader(self.read(self.num(2)*2))
            if not chunk.data: raise ValueError('Empty note chunk')
            while chunk.pos<len(chunk.data):
                count=chunk.num() or chunk.num(2); value=chunk.num()
                if not count or len(out)+count>size: raise ValueError('Invalid run length')
                out.extend(bytes([value])*count)
        return out

def inflate(data):
    d=zlib.decompressobj(); out=d.decompress(data,16_000_001)
    if len(out)>16_000_000 or not d.eof: raise ValueError('Invalid or oversized compressed data')
    return out

def parse(data, filename='Untitled.tbt'):
    if len(data)<64 or data[:3]!=b'TBT': raise ValueError('This is not a TabIt .tbt file')
    v,n=data[3],data[5]
    if v not in (0x6f,0x70,0x71,0x72): raise ValueError('Supported TabIt formats: 1.6–2.0 (0x6f–0x72). Please resave older files in TabIt 2.03.')
    if not 1<=n<=15: raise ValueError('Invalid track count')
    u16=lambda p:int.from_bytes(data[p:p+2],'little')
    size=int.from_bytes(data[48:52],'little')
    m=Reader(inflate(data[64:64+size])); b=Reader(inflate(data[64+size:]))
    spaces=[m.num(4) for _ in range(n)] if v>=0x70 else [u16(42)]*n
    if any(s>32000 or s<1 for s in spaces): raise ValueError('Invalid track length')
    fields={}
    names=['strings','program','mutedProgram','volume']
    if v>=0x71: names+=['modulation','pitchBend']
    names+=['transpose','bank','reverb','chorus','pan','highest','midiNumbers','channel','top','bottom']
    for name in names: fields[name]=[m.num(2 if name=='pitchBend' else 1) for _ in range(n)]
    signed=lambda x:x-256 if x>127 else x
    tuning=[[signed(m.num()) for _ in range(8)] for _ in range(n)]
    drums=[m.num() for _ in range(n)]
    info={key:m.string() for key in ['title','artist','album','transcriber','comment']}
    bars=[]
    if v>=0x70:
        pos=0
        for _ in range(u16(40)):
            length,flags,repeats=b.num(4),b.num(),b.num()
            bars.append(dict(start=pos,length=length,flags=flags,repeats=repeats)); pos+=length
    else:
        raw=b.runs(spaces[0]); start=0; flags=0
        for i,x in enumerate(raw):
            kind=x&15
            if kind==3:
                if i>start: bars.append(dict(start=start,length=i-start,flags=flags,repeats=0))
                start=i; flags=2
            elif kind in (1,2,4):
                bars.append(dict(start=start,length=i+1-start,flags=flags|(4 if kind==2 else 0),repeats=x>>4)); start=i+1; flags=0
        if start<len(raw): bars.append(dict(start=start,length=len(raw)-start,flags=flags,repeats=0))
    if not bars: bars=[dict(start=0,length=spaces[0],flags=0,repeats=0)]
    rawnotes=[b.runs(s*20) for s in spaces]
    timing=[b.runs(s*2) for s in spaces] if data[11]&16 else [bytes([1,1])*s for s in spaces]
    changes=[[] for _ in spaces]
    if v>=0x71:
        for changeset in changes:
            c=Reader(b.read(b.num(4))); p=0
            while c.pos<len(c.data):
                p+=c.num(2); effect=c.num(2); c.num(2); value=c.num(2)
                changeset.append(dict(space=p,effect=effect,value=value))
    tracks=[]; warnings=set()
    for i,s in enumerate(spaces):
        count=fields['strings'][i]
        if not 1<=count<=8: raise ValueError('Invalid string count')
        # TabIt strings are indexed from low to high; shorter instruments use the same E-A-D-G basis.
        pitches=[40,45,50,55,59,64,69,74]
        pitches=[p+tuning[i][j]+signed(fields['transpose'][i]) for j,p in enumerate(pitches)]
        times=[0.0]
        for p in range(s):
            a,c=timing[i][p*2:p*2+2]; times.append(times[-1]+(a/c if a and c else 1))
        notes=[]; active={}
        for p in range(s):
            row=rawnotes[i][p*20:p*20+20]
            if fields['program'][i]&128 and any(row[:count]):
                for note in active.values(): note['duration']=times[p]-note['start']
                active={}
            for j in range(count):
                x=row[j]
                if not x: continue
                if j in active:
                    previous=active.pop(j); previous['duration']=times[p]-previous['start']
                if x>=128 or x==17:
                    fret=x-128 if x>=128 else 0
                    note=dict(space=p,start=times[p],duration=times[-1]-times[p],string=j,fret=fret if x>=128 else 'x',pitch=fret if drums[i] else pitches[j]+fret,effect=chr(row[8+j]) if row[8+j] else '')
                    notes.append(note); active[j]=note
                    if x==17: note['muted']=True
                elif x==18: notes.append(dict(space=p,start=times[p],duration=0,string=j,fret='*',pitch=0,effect=''))
            if row[16] and v<=0x70:
                effect={84:3,116:3,73:4,86:5,80:6,67:7,82:8}.get(row[16])
                if effect: changes[i].append(dict(space=p,effect=effect,value=row[19]+(250 if row[16]==116 else 0)))
        for c in changes[i]: c['start']=times[min(c['space'],s)]
        if any(x['effect'] for x in notes): warnings.add('String articulations are shown; playback uses the underlying fretted notes.')
        if any(c['effect'] in (1,2,9,10) for c in changes[i]): warnings.add('Stroke, modulation and pitch-bend changes are not yet synthesized.')
        tracks.append(dict(index=i,name=('Drums' if drums[i] else 'Guitar')+' '+str(i+1),strings=count,pitches=pitches[:count],program=fields['program'][i]&127,volume=fields['volume'][i],pan=fields['pan'][i],drums=bool(drums[i]),notes=notes,changes=changes[i],length=times[-1]))
    return dict(**info,filename=filename,tempo=u16(46) or data[4],tracks=tracks,bars=bars,length=max(t['length'] for t in tracks),warnings=sorted(warnings))

def vlq(n):
    n=max(0,round(n)); out=[n&127]; n>>=7
    while n: out.insert(0,(n&127)|128); n>>=7
    return bytes(out)

def midi(song):
    events=[]; sequence=[]; repeat_start=0; offset=0
    for i,bar in enumerate(song['bars']):
        if bar['flags']&2: repeat_start=i
        sequence.append((bar,offset)); offset+=bar['length']
        if bar['flags']&4:
            for _ in range(max(0,min(255,bar['repeats'])-1)):
                for repeated in song['bars'][repeat_start:i+1]: sequence.append((repeated,offset)); offset+=repeated['length']
    if not sequence: sequence=[(dict(start=0,length=song['length']),0)]
    events.append((0,b'\xff\x51\x03'+round(60_000_000/song['tempo']).to_bytes(3,'big')))
    channels=[x for x in range(16) if x!=9]
    for t in song['tracks']:
        ch=9 if t['drums'] else channels[t['index']]
        events.extend([(0,bytes([0xc0|ch,t['program']])),(0,bytes([0xb0|ch,7,min(127,t['volume'])]))])
        for bar,offset in sequence:
            for note in t['notes']:
                if note['fret']=='*' or not bar['start']<=note['start']<bar['start']+bar['length']: continue
                start=offset+note['start']-bar['start']; duration=min(note['duration'],bar['start']+bar['length']-note['start'])
                if note.get('muted'): duration=min(duration,0.14)
                pitch=max(0,min(127,note['pitch']))
                events.extend([(round(start*120),bytes([0x90|ch,pitch,90])),(round((start+max(.01,duration))*120),bytes([0x80|ch,pitch,0]))])
            for c in t['changes']:
                if not bar['start']<=c['start']<bar['start']+bar['length']: continue
                tick=round((offset+c['start']-bar['start'])*120); v=c['value']
                if c['effect']==3 and v: events.append((tick,b'\xff\x51\x03'+round(60_000_000/v).to_bytes(3,'big')))
                elif c['effect']==4: events.append((tick,bytes([0xc0|ch,v&127])))
                elif c['effect'] in (5,6,7,8): events.append((tick,bytes([0xb0|ch,{5:7,6:10,7:93,8:91}[c['effect']],min(127,v)])))
    events.sort(key=lambda e:(e[0],0 if e[1][0]&240==128 else 1)); raw=bytearray(); prev=0
    for tick,event in events: raw+=vlq(tick-prev)+event; prev=tick
    raw+=vlq(max(prev,round(offset*120))-prev)+b'\xff\x2f\x00'
    return b'MThd'+struct.pack('>IHHH',6,0,1,480)+b'MTrk'+struct.pack('>I',len(raw))+raw


def create_tbt(draft):
    """Write a new fixed-grid score as TabIt 0x70, with zlib streams and CRCs.

    This authoring schema intentionally excludes imported effects/repeats so that
    editing a new score cannot silently discard features in an imported file.
    """
    def integer(value, low, high, name):
        if type(value) is not int or not low <= value <= high:
            raise ValueError(f'{name} must be an integer from {low} to {high}')
        return value

    if not isinstance(draft, dict): raise ValueError('Expected a score object')
    tempo = integer(draft.get('tempo'), 30, 500, 'Tempo')
    measures = integer(draft.get('measures'), 1, 256, 'Measure count')
    tracks = draft.get('tracks')
    if not isinstance(tracks, list) or not 1 <= len(tracks) <= 15:
        raise ValueError('A score needs 1–15 tracks')
    spaces = measures * 16
    standard = [40,45,50,55,59,64,69,74]
    normalized = []
    for track in tracks:
        if not isinstance(track, dict): raise ValueError('Invalid track')
        pitches = track.get('pitches')
        if not isinstance(pitches, list) or not 1 <= len(pitches) <= 8:
            raise ValueError('A track needs 1–8 strings')
        for pitch in pitches: integer(pitch, 0, 127, 'Open string pitch')
        program = integer(track.get('program'), 0, 127, 'Instrument')
        grid = track.get('grid')
        if not isinstance(grid, list) or len(grid) != len(pitches): raise ValueError('Invalid note grid')
        raw = bytearray(spaces * 20)
        for string, row in enumerate(grid):
            if not isinstance(row, list) or len(row) != spaces: raise ValueError('Invalid measure length')
            for step, fret in enumerate(row):
                if fret is None: continue
                if fret == 'x': value = 17
                elif fret == '*': value = 18
                else: value = 128 + integer(fret, 0, 99, 'Fret / drum note')
                raw[step * 20 + string] = value
        normalized.append((pitches, program, bool(track.get('drums')), raw))

    def encode_runs(raw):
        chunks = bytearray(); pairs = bytearray(); i = 0
        while i < len(raw):
            j = i + 1
            while j < len(raw) and raw[j] == raw[i] and j-i < 255: j += 1
            pairs += bytes([j-i, raw[i]]); i = j
            if len(pairs) == 65534:
                chunks += struct.pack('<H', len(pairs)//2) + pairs; pairs.clear()
        if pairs: chunks += struct.pack('<H', len(pairs)//2) + pairs
        return chunks

    n = len(tracks)
    meta = bytearray(struct.pack('<I', spaces) * n)
    for values in [
        [len(t[0]) for t in normalized], [t[1] for t in normalized], [28]*n,
        [96]*n, [0]*n, [0]*n, [0]*n, [0]*n, [64]*n, [99]*n,
        [int(t[2]) for t in normalized], [9 if t[2] else 255 for t in normalized], [0]*n, [0]*n,
    ]: meta += bytes(values)
    for pitches, _, drums, _ in normalized:
        meta += bytes(((pitches[j] if j < len(pitches) else standard[j])-standard[j]) & 255 for j in range(8))
    meta += bytes(int(t[2]) for t in normalized)
    for key in ['title','artist','album','transcriber','comment']:
        value = draft.get(key, '')
        if not isinstance(value,str): raise ValueError(f'{key} must be text')
        try: text = value.encode('cp1252')
        except UnicodeEncodeError: raise ValueError('TabIt titles and credits support Western European characters only')
        if len(text)>65535: raise ValueError(f'{key} is too long')
        meta += struct.pack('<H',len(text)) + text
    body = bytearray(struct.pack('<IBB',16,0,0)*measures)
    for _,_,_,notes in normalized: body += encode_runs(notes)
    metadata = zlib.compress(bytes(meta),9)
    payload = metadata + zlib.compress(bytes(body),9)
    header = bytearray(64)
    header[:4] = b'TBTp'; header[4] = min(255,tempo); header[5] = n
    header[6:10] = b'\x032.0'; header[11] = 11
    struct.pack_into('<H',header,40,measures)
    struct.pack_into('<H',header,46,tempo)
    struct.pack_into('<III',header,48,len(metadata),zlib.crc32(payload),64+len(payload))
    struct.pack_into('<I',header,60,zlib.crc32(header[:60]))
    return bytes(header)+payload
