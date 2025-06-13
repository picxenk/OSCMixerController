const express = require('express');
const { Client } = require('node-osc');
const path = require('path');

const app = express();
const port = 3000;

// XR18 기본 설정
const XR18_IP = '192.168.1.1'; // XR18 IP 주소 (환경에 맞게 변경)
const XR18_PORT = 10024;

// OSC 클라이언트 생성
const oscClient = new Client(XR18_IP, XR18_PORT);

// 정적 파일 제공
app.use(express.static('public'));
app.use(express.json());

// 메인 페이지
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// OSC 메시지 전송 API
app.post('/osc', (req, res) => {
    const { address, value } = req.body;
    
    try {
        console.log(`OSC send: ${address} = ${value}`);
        oscClient.send(address, parseFloat(value));
        res.json({ success: true, message: `send: ${address} = ${value}` });
    } catch (error) {
        console.error('OSC send error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 버튼 액션 (채널 뮤트/언뮤트)
app.post('/button', (req, res) => {
    const { action } = req.body;
    
    try {
        if (action === 'mute_ch1') {
            // 채널 1 뮤트 토글
            oscClient.send('/ch/01/mix/on', 0); // 0 = 뮤트, 1 = 언뮤트
            console.log('CH 1 Muted');
        } else if (action === 'unmute_ch1') {
            oscClient.send('/ch/01/mix/on', 1);
            console.log('CH 1 Unmuted');
        }
        
        res.json({ success: true, action: action });
    } catch (error) {
        console.error('Button action error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`XR18 OSC Controller is running on http://localhost:${port}`);
    console.log(`XR18 target: ${XR18_IP}:${XR18_PORT}`);
});