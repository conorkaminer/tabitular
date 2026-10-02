import unittest, zlib, struct
from tbt import create_tbt, parse, midi

def draft():
    return {'title':'New riff','tempo':140,'measures':2,'tracks':[
        {'program':30,'pitches':[38,45,50,55,59,64],'drums':False,'grid':[[None]*32 for _ in range(6)]},
        {'program':34,'pitches':[28,33,38,43],'drums':False,'grid':[[None]*32 for _ in range(4)]},
        {'program':0,'pitches':[0]*6,'drums':True,'grid':[[None]*32 for _ in range(6)]}]}

class WriterTests(unittest.TestCase):
    def test_round_trip(self):
        d=draft();d['tracks'][0]['grid'][0][0]=0;d['tracks'][0]['grid'][0][4]=12;d['tracks'][0]['grid'][0][8]='*'
        d['tracks'][0]['grid'][1][16]='x';d['tracks'][1]['grid'][0][0]=3;d['tracks'][2]['grid'][0][0]=36
        raw=create_tbt(d);s=parse(raw)
        self.assertEqual(s['title'],'New riff');self.assertEqual(s['tempo'],140)
        self.assertEqual(len(s['bars']),2)
        self.assertEqual([t['program'] for t in s['tracks']],[30,34,0])
        self.assertEqual(s['tracks'][0]['pitches'],[38,45,50,55,59,64])
        self.assertEqual([(n['pitch'],n['start'],n['duration']) for n in s['tracks'][0]['notes'][:3]],[(38,0,4),(50,4,4),(0,8,0)])
        self.assertTrue(s['tracks'][0]['notes'][3]['muted'])
        self.assertEqual(s['tracks'][1]['notes'][0]['pitch'],31)
        self.assertTrue(s['tracks'][2]['drums']);self.assertEqual(s['tracks'][2]['notes'][0]['pitch'],36)
        self.assertTrue(midi(s).startswith(b'MThd'))
    def test_header_checksums_and_streams(self):
        raw=create_tbt(draft());meta_len,crc,total,header_crc=struct.unpack_from('<IIII',raw,48)
        self.assertEqual(raw[:4],b'TBTp');self.assertEqual(raw[6:10],b'\x032.0')
        self.assertEqual(crc,zlib.crc32(raw[64:]));self.assertEqual(header_crc,zlib.crc32(raw[:60]));self.assertEqual(total,len(raw))
        body=zlib.decompress(raw[64+meta_len:]);self.assertEqual(body[:12],struct.pack('<IBB',16,0,0)*2)
    def test_empty_and_large_scores(self):
        d=draft();self.assertTrue(all(not t['notes'] for t in parse(create_tbt(d))['tracks']))
        d['measures']=256;d['tracks']=d['tracks'][:1];d['tracks'][0]['grid']=[[i%25 for i in range(4096)] for _ in range(6)]
        s=parse(create_tbt(d));self.assertEqual(len(s['tracks'][0]['notes']),24576)
    def test_invalid_drafts(self):
        for key,value in [('tempo',0),('measures',257),('tracks',[]),('title','🎸')]:
            d=draft();d[key]=value
            with self.assertRaises(ValueError):create_tbt(d)
        d=draft();d['tracks'][0]['grid'][0][0]=100
        with self.assertRaises(ValueError):create_tbt(d)

if __name__=='__main__':unittest.main()
