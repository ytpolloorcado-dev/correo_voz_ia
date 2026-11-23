// Selección de elementos del DOM
const barContent = document.getElementById('bar-content');
const minimizedTab = document.getElementById('minimized-tab');
const btnMinimize = document.getElementById('btn-minimize');
const btnMic = document.getElementById('btn-mic');
const btnDemo = document.getElementById('btn-demo');
const statusText = document.getElementById('status-text');

const previewCard = document.getElementById('preview-card');
const btnClosePreview = document.getElementById('btn-close-preview');
const btnCancel = document.getElementById('btn-cancel');
const btnSend = document.getElementById('btn-send');
const toast = document.getElementById('toast');

// Inputs de la vista previa
const inputTo = document.getElementById('input-to');
const inputCc = document.getElementById('input-cc');
const inputSubject = document.getElementById('input-subject');
const inputMessage = document.getElementById('input-message');

let isListening = false;

// 1. Funcionalidad de Minimizar / Maximizar barra
btnMinimize.addEventListener('click', () => {
    barContent.classList.add('hidden');
    previewCard.classList.add('hidden');
    minimizedTab.classList.remove('hidden');
});

minimizedTab.addEventListener('click', () => {
    minimizedTab.classList.add('hidden');
    barContent.classList.remove('hidden');
});

// 2. Simulación del Botón de Micrófono (Escucha de Voz real o simulada)
btnMic.addEventListener('click', () => {
    if (!isListening) {
        startListeningSimulation("Escuchando instrucción de voz...");
    } else {
        stopListeningSimulation();
    }
});

// 3. Botón de prueba rápida con la frase exacta que pediste
btnDemo.addEventListener('click', () => {
    startListeningSimulation("Procesando audio...");
    
    // Simulamos que el usuario dijo exactamente tu frase
    setTimeout(() => {
        const fraseSimulada = "Hola, quiero que le envies un correo a Jose Gonzalez diciendole que mañana haga la actividad que le encargue ayer y le pones copia a Juan perez.";
        statusText.textContent = "¡Voz procesada!";
        btnMic.classList.remove('listening');
        isListening = false;

        // Simulamos que la IA analiza la frase y extrae los datos para el correo
        parsearInstruccionConIA(fraseSimulada);
    }, 2000);
});

function startListeningSimulation(mensaje) {
    isListening = true;
    btnMic.classList.add('listening');
    statusText.textContent = mensaje;
    previewCard.classList.add('hidden');
}

function stopListeningSimulation() {
    isListening = false;
    btnMic.classList.remove('listening');
    statusText.textContent = "Listo para escuchar...";
}

// 4. Simulación de la IA estructurando el correo en base a la frase hablada
function parsearInstruccionConIA(texto) {
    // Aquí es donde en el futuro conectarás tu API de IA (por ejemplo, OpenAI, Gemini o un script de Python backend)
    // Para este ejemplo demostrativo, mapeamos los campos extraídos:
    
    inputTo.value = "Jose Gonzalez (jose.gonzalez@empresa.com)";
    inputCc.value = "Juan Perez (juan.perez@empresa.com)";
    inputSubject.value = "Recordatorio de actividad pendiente";
    inputMessage.value = "Hola Jose,\n\nTe escribo para recordarte que mañana hagas la actividad que te encargué ayer.\n\nSaludos.";

    // Mostramos la tarjeta desplegable con la vista previa
    previewCard.classList.remove('hidden');
    statusText.textContent = "Correo generado por IA";
}

// 5. Cerrar o cancelar vista previa
function cerrarPreview() {
    previewCard.classList.add('hidden');
    statusText.textContent = "Listo para escuchar...";
}

btnClosePreview.addEventListener('click', cerrarPreview);
btnCancel.addEventListener('click', cerrarPreview);

// 6. Acción de Enviar Correo definitivo
btnSend.addEventListener('click', () => {
    previewCard.classList.add('hidden');
    
    // Mostrar notificación Toast de éxito
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
        statusText.textContent = "Listo para escuchar...";
    }, 3000);
});