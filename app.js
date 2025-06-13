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

// 페이더 애니메이션 상태
let faderAnimations = {
    channels23: {
        isRunning: false,
        targetValue: 0.75, // 목표 볼륨 (75%)
        currentValue: 0,
        isGoingUp: true
    }
};

// 천천히 페이더 조절하는 함수
function animateFaders(channels, targetValue, duration = 2000) {
    const startValues = channels.map(() => faderAnimations.channels23.currentValue);
    const startTime = Date.now();
    
    const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // easeInOut 함수로 부드러운 애니메이션
        const easeProgress = progress < 0.5 
            ? 2 * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        channels.forEach((channel, index) => {
            const startValue = startValues[index];
            const currentValue = startValue + (targetValue - startValue) * easeProgress;
            
            // OSC 메시지 전송
            const oscAddress = `/ch/${channel.toString().padStart(2, '0')}/mix/fader`;
            oscClient.send(oscAddress, currentValue);
        });
        
        faderAnimations.channels23.currentValue = 
            startValues[0] + (targetValue - startValues[0]) * easeProgress;
        
        if (progress < 1) {
            setTimeout(animate, 50); // 20fps로 애니메이션
        } else {
            faderAnimations.channels23.isRunning = false;
            console.log(`채널 ${channels.join(', ')} 페이더 애니메이션 완료: ${Math.round(targetValue * 100)}%`);
        }
    };
    
    animate();
}

// 버튼 액션 (채널 뮤트/언뮤트 + 페이더 조절)
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
        } else if (action === 'fade_ch23') {
            // 채널 2, 3번 페이더 애니메이션
            if (faderAnimations.channels23.isRunning) {
                return res.json({ success: false, error: '애니메이션이 이미 실행 중입니다.' });
            }
            
            faderAnimations.channels23.isRunning = true;
            const targetValue = faderAnimations.channels23.isGoingUp 
                ? faderAnimations.channels23.targetValue 
                : 0;
            
            console.log(`채널 2, 3 페이더를 ${Math.round(targetValue * 100)}%로 조절 시작`);
            animateFaders([2, 3], targetValue, 2000); // 2초 동안 애니메이션
            
            faderAnimations.channels23.isGoingUp = !faderAnimations.channels23.isGoingUp;
        }
        
        res.json({ success: true, action: action });
    } catch (error) {
        console.error('버튼 액션 오류:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`XR18 OSC 컨트롤러가 http://localhost:${port} 에서 실행중`);
    console.log(`XR18 연결 대상: ${XR18_IP}:${XR18_PORT}`);
});