const express = require('express');
const { Client } = require('node-osc');
const path = require('path');
const { exec } = require('child_process');

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
const faderAnimations = new Map();

// 현재 페이더 값 저장
const currentFaderValues = new Map();

// 천천히 페이더 조절하는 함수
function animateFaders(channels, targetValues, duration = 2000) {
    const startTime = Date.now();
    
    // 각 채널의 현재 값을 가져오거나 0으로 초기화
    const startValues = channels.map(channel => {
        if (!currentFaderValues.has(channel)) {
            currentFaderValues.set(channel, 0);
        }
        return currentFaderValues.get(channel);
    });
    
    const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // easeInOut 함수로 부드러운 애니메이션
        const easeProgress = progress < 0.5 
            ? 2 * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        channels.forEach((channel, index) => {
            const startValue = startValues[index];
            const targetValue = targetValues[index];
            const currentValue = startValue + (targetValue - startValue) * easeProgress;
            
            // 현재 값 저장
            currentFaderValues.set(channel, currentValue);
            
            // OSC 메시지 전송
            const oscAddress = `/ch/${channel.toString().padStart(2, '0')}/mix/fader`;
            oscClient.send(oscAddress, currentValue);
        });
        
        if (progress < 1) {
            setTimeout(animate, 50); // 20fps로 애니메이션
        } else {
            // 애니메이션 완료 시 최종 값 저장
            channels.forEach((channel, index) => {
                currentFaderValues.set(channel, targetValues[index]);
            });
            console.log(`채널 ${channels.join(', ')} 페이더 애니메이션 완료: ${targetValues.map(v => Math.round(v * 100)).join('%, ')}%`);
        }
    };
    
    animate();
}

// 버튼 액션 (채널 뮤트/언뮤트 + 페이더 조절)
app.post('/button', (req, res) => {
    const { action, channels, targetValues } = req.body;
    
    try {
        if (action === 'mute_master') {
            // 마스터 뮤트 토글
            oscClient.send('/lr/mix/on', 0); // 0 = 뮤트, 1 = 언뮤트
            console.log('Master Muted');
            res.json({ success: true, action: action });
        } else if (action === 'unmute_master') {
            oscClient.send('/lr/mix/on', 1);
            console.log('Master Unmuted');
            res.json({ success: true, action: action });
        } else if (action === 'fade_channels' && channels && targetValues) {
            // 여러 채널 페이더 애니메이션
            console.log(`채널 ${channels.join(', ')} 페이더를 ${targetValues.map(v => Math.round(v * 100)).join('%, ')}%로 조절 시작`);
            animateFaders(channels, targetValues, 2000); // 2초 동안 애니메이션
            res.json({ success: true, action: action });
        } else {
            res.status(400).json({ success: false, error: 'Invalid action or parameters' });
        }
    } catch (error) {
        console.error('버튼 액션 오류:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 셧다운 API
app.post('/shutdown', (req, res) => {
    try {
        console.log('시스템 종료 요청 받음');
        res.json({ success: true, message: '시스템이 종료됩니다.' });
        
        // 3초 후 시스템 종료 실행
        setTimeout(() => {
            exec('sudo shutdown -h now', (error, stdout, stderr) => {
                if (error) {
                    console.error('셧다운 오류:', error);
                    return;
                }
                if (stderr) {
                    console.error('셧다운 stderr:', stderr);
                    return;
                }
                console.log('셧다운 stdout:', stdout);
            });
        }, 3000);
    } catch (error) {
        console.error('셧다운 처리 오류:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`XR18 OSC 컨트롤러가 http://localhost:${port} 에서 실행중`);
    console.log(`XR18 연결 대상: ${XR18_IP}:${XR18_PORT}`);
});