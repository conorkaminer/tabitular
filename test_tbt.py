import unittest, struct, zlib
from tbt import parse, midi, Reader

def fixture():
    header=bytearray(64); header[:4]=b'TBTo'; header[4:6]=bytes([120,1]); header[11]=11
    struct.pack_into('<H',header,42,16);struct.pack_into('<H',header,46,120)
    meta=bytes([6,27,28,96,0,0,0,0,64,24,0,255,0,0])+bytes(8)+b'\x00'+b'\x00\x00'*5
    # A low-E open note at step 0, fret 3 at step 4, stop at step 8.
    notes=bytearray(320);notes[0]=128;notes[80]=131;notes[160]=18
    def runs(raw):
        out=bytearray();i=0
        while i<len(raw):
            j=i+1
            while j<len(raw) and raw[j]==raw[i] and j-i<255:j+=1
            out+=bytes([j-i,raw[i]]);i=j
        return struct.pack('<H',len(out)//2)+out
    body=runs(bytes(15)+b'\x01')+runs(notes)
    meta=zlib.compress(meta);struct.pack_into('<I',header,48,len(meta))
    return bytes(header)+meta+zlib.compress(body)

class Tests(unittest.TestCase):
    def test_notes_and_durations(self):
        s=parse(fixture());notes=s['tracks'][0]['notes']
        self.assertEqual([(n['pitch'],n['start'],n['duration']) for n in notes],[(40,0,4),(43,4,4),(0,8,0)])
        self.assertEqual(s['bars'],[dict(start=0,length=16,flags=0,repeats=0)])
    def test_midi(self):
        data=midi(parse(fixture()))
        self.assertEqual(data[:14],b'MThd'+struct.pack('>IHHH',6,0,1,480))
        self.assertEqual(int.from_bytes(data[18:22],'big'),len(data)-22)
        self.assertIn(b'\x90\x28\x5a',data);self.assertTrue(data.endswith(b'\xff\x2f\x00'))
    def test_invalid(self):
        for data in [b'',b'not a tab',fixture()[:-4]]:
            with self.assertRaises((ValueError,zlib.error)):parse(data)
    def test_oversized_run(self):
        with self.assertRaises(ValueError):Reader(b'\x01\x00\x10\x80').runs(4)

if __name__=='__main__':unittest.main()
