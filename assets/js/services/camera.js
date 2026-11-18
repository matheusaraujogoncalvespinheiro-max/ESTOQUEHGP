// Câmera do navegador (foto de visitantes)

async function iniciarCamera() {
    try {
        const video = document.getElementById('webcam-preview');
        const placeholder = document.getElementById('webcam-placeholder');
        if (!video) return;
        
        pararCamera();
        
        const constraints = {
            video: {
                width: { ideal: 320 },
                height: { ideal: 240 },
                facingMode: "user"
            }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        window.currentCameraStream = stream;
        video.srcObject = stream;
        video.classList.remove('hidden');
        if (placeholder) placeholder.classList.add('hidden');
        
        document.getElementById('btn-ligar-camera').classList.add('hidden');
        document.getElementById('btn-tirar-foto').classList.remove('hidden');
        lucide.createIcons();
    } catch (err) {
        console.error("Erro no acesso à câmera:", err);
        showMsg("Câmera indisponível: Registro será feito com foto padrão.", "error");
    }
}

function tirarFoto() {
    const video = document.getElementById('webcam-preview');
    const canvas = document.getElementById('webcam-canvas');
    if (!video || !canvas) return;
    
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const base64Photo = canvas.toDataURL('image/jpeg', 0.6);
    state.capturedPhoto = base64Photo;
    
    const previewImg = document.getElementById('photo-preview');
    if (previewImg) {
        previewImg.src = base64Photo;
        previewImg.classList.remove('hidden');
    }
    
    pararCamera();
    
    video.classList.add('hidden');
    document.getElementById('btn-tirar-foto').classList.add('hidden');
    document.getElementById('btn-recapturar-foto').classList.remove('hidden');
    lucide.createIcons();
}

function recapturarFoto() {
    state.capturedPhoto = null;
    const previewImg = document.getElementById('photo-preview');
    if (previewImg) {
        previewImg.classList.add('hidden');
        previewImg.src = '';
    }
    iniciarCamera();
}

function pararCamera() {
    if (window.currentCameraStream) {
        window.currentCameraStream.getTracks().forEach(track => {
            track.stop();
        });
        window.currentCameraStream = null;
    }
}

// Expor funções usadas em atributos onclick/oninput do HTML
window.iniciarCamera = iniciarCamera;
window.tirarFoto = tirarFoto;
window.recapturarFoto = recapturarFoto;
window.pararCamera = pararCamera;
