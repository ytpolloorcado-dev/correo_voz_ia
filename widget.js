/**
 * widget.js
 * Asistente de Voz Inteligente para Correos con FastAPI (prueba.py).
 * 
 * Máquina de estados:
 *   - 'idle': En espera, listo para grabar.
 *   - 'recording': Micrófono activo en Python, temporizador corriendo, botón rojo pulsando.
 *   - 'processing': Audio cortado, procesando con IA (Gemini, SQL, SMTP), botón en spinner violeta.
 * Permite cancelar/reiniciar en cualquier momento haciendo clic en el botón o en el icono de reinicio.
 */

const API_BASE_URL = window.API_BASE_URL || 'http://127.0.0.1:8000';

let currentState = 'idle'; // 'idle' | 'recording' | 'processing'
let isPreviewOpen = false;
let recordingInterval = null;
let recordingSeconds = 0;
let abortController = null;
let safetyTimeout = null;

/**
 * Transición y actualización de la interfaz según el estado
 */
function setWidgetState(newState, customMessage = null) {
    currentState = newState;
    console.log(`[Widget State] -> ${newState}`);

    const micBtn = document.getElementById('micBtn');
    const micPulse = document.getElementById('micPulse');
    const micIcon = document.getElementById('micIcon');
    const statusText = document.getElementById('statusText');
    const recordingSection = document.getElementById('recordingSection');
    const recordingTimer = document.getElementById('recordingTimer');
    const recordingHeaderText = document.getElementById('recordingHeaderText');
    const stopRecordingBtn = document.getElementById('stopRecordingBtn');
    const btnResetVoice = document.getElementById('btnResetVoice');

    if (!micBtn || !micPulse || !micIcon) return;

    if (newState === 'idle') {
        // Detener contadores y timeouts
        clearInterval(recordingInterval);
        recordingInterval = null;
        clearTimeout(safetyTimeout);
        safetyTimeout = null;

        // Resetear aspecto del botón de micrófono a normal
        micBtn.classList.remove('ring-4', 'ring-rose-500/40', 'ring-violet-500/50');
        micPulse.className = 'absolute inset-0 rounded-2xl bg-rose-500 opacity-0 transition-opacity';
        micIcon.className = 'fa-solid fa-microphone text-sm relative z-10 text-white';
        micBtn.title = "Iniciar grabación de voz";

        // Resetear texto de estado
        if (statusText) statusText.innerText = customMessage || "Listo para escuchar...";

        // Ocultar botón de reinicio
        if (btnResetVoice) btnResetVoice.classList.add('hidden');

        // Ocultar sección de grabación
        if (recordingSection) {
            recordingSection.classList.add('translate-y-2', 'opacity-0');
            setTimeout(() => recordingSection.classList.add('hidden'), 300);
        }

        // Habilitar botón de terminar
        if (stopRecordingBtn) {
            stopRecordingBtn.disabled = false;
            stopRecordingBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }

    } else if (newState === 'recording') {
        // Aspecto de botón: Grabando (rojo vibrante)
        micBtn.classList.remove('ring-violet-500/50');
        micBtn.classList.add('ring-4', 'ring-rose-500/40');
        micPulse.className = 'absolute inset-0 rounded-2xl bg-rose-500 opacity-100 animate-pulse-slow transition-opacity';
        micIcon.className = 'fa-solid fa-waveform text-sm relative z-10 animate-bounce text-white';
        micBtn.title = "Grabando... Clic para terminar de hablar y procesar";

        // Texto de estado
        if (statusText) statusText.innerText = "🎤 Escuchando voz...";

        // Mostrar botón de reinicio
        if (btnResetVoice) btnResetVoice.classList.remove('hidden');

        // Mostrar sección de grabación activa
        if (recordingHeaderText) recordingHeaderText.innerText = "Grabando voz...";
        if (recordingTimer) recordingTimer.innerText = "00:00 • Habla ahora";
        if (recordingSection) {
            recordingSection.classList.remove('hidden');
            setTimeout(() => recordingSection.classList.remove('translate-y-2', 'opacity-0'), 10);
        }

        // Iniciar temporizador
        recordingSeconds = 0;
        clearInterval(recordingInterval);
        recordingInterval = setInterval(() => {
            recordingSeconds++;
            const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
            const secs = String(recordingSeconds % 60).padStart(2, '0');
            if (recordingTimer) {
                recordingTimer.innerText = `${mins}:${secs} • Habla ahora`;
            }
        }, 1000);

    } else if (newState === 'processing') {
        // Detener temporizador
        clearInterval(recordingInterval);
        recordingInterval = null;

        // Aspecto de botón: PROCESANDO (violeta con spinner, NO grabado rojo)
        micBtn.classList.remove('ring-rose-500/40');
        micBtn.classList.add('ring-4', 'ring-violet-500/50');
        micPulse.className = 'absolute inset-0 rounded-2xl bg-violet-600 opacity-30 animate-pulse transition-opacity';
        micIcon.className = 'fa-solid fa-circle-notch fa-spin text-sm relative z-10 text-white';
        micBtn.title = "Procesando con IA... Clic para cancelar y reiniciar";

        // Texto de estado
        if (statusText) statusText.innerText = "⚡ Procesando con IA...";

        // Botón de reinicio visible
        if (btnResetVoice) btnResetVoice.classList.remove('hidden');

        // Actualizar tarjeta de grabación y desvanecerla
        if (recordingHeaderText) recordingHeaderText.innerText = "Cortando audio...";
        if (recordingTimer) recordingTimer.innerText = "Analizando con Gemini y SQL...";
        if (stopRecordingBtn) {
            stopRecordingBtn.disabled = true;
            stopRecordingBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }

        // Ocultar la sección tras breve feedback visual
        setTimeout(() => {
            if (currentState === 'processing' && recordingSection) {
                recordingSection.classList.add('translate-y-2', 'opacity-0');
                setTimeout(() => recordingSection.classList.add('hidden'), 300);
            }
        }, 800);
    }
}

/**
 * Inicia la grabación conectando con el backend
 */
async function startVoiceRecording() {
    setWidgetState('recording');
    showToast("Micrófono activado. Habla y presiona 'Terminar' cuando acabes.", "info");

    abortController = new AbortController();

    // Timeout de seguridad: si tras 40 segundos no hay respuesta, liberar la interfaz
    safetyTimeout = setTimeout(() => {
        if (currentState !== 'idle') {
            console.warn("Tiempo límite de espera alcanzado (40s). Reseteando interfaz.");
            cancelAndReset("Tiempo de espera agotado. Se reinició el asistente.");
        }
    }, 40000);

    try {
        const response = await fetch(`${API_BASE_URL}/voice`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: abortController.signal
        });

        clearTimeout(safetyTimeout);

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log("Respuesta recibida del backend /voice:", data);

        // Caso 404: No se detectó voz comprensible
        if (data.Status === 404 || data.status === 404) {
            const msg = data.Message || data.message || "No se detectó voz en la grabación.";
            showToast(msg, "error");
            setWidgetState('idle', "No se entendió el audio");
            return;
        }

        // Caso 502: Error en servidor/Gemini/DB/SMTP
        if (data.status === 502 || data.Status === 502) {
            const detail = data.Request || data.message || "Error procesando la solicitud.";
            showToast(`Error: ${detail}`, "error");
            setWidgetState('idle', "Error en el servidor");
            return;
        }

        // Caso 202: Éxito total
        if (data.status === 202 || data.Status === 202) {
            const req = data.Request || data.request || {};

            const toName = req.NameTo || '';
            const toEmail = req.To && req.To !== "correo de la persona" ? req.To : '';
            const recipientText = toName && toEmail 
                ? `${toName} <${toEmail}>` 
                : (toName || toEmail || 'Destinatario detectado');

            const ccText = req.NameCc && req.NameCc !== 'null' ? req.NameCc : '';
            const subjectText = req.Subject || 'Sin asunto';
            const bodyText = req.Body || '';

            // Rellenar campos del correo en el HTML
            const inputTo = document.getElementById('emailTo');
            const inputCc = document.getElementById('emailCc');
            const inputSubject = document.getElementById('emailSubject');
            const inputBody = document.getElementById('emailBody');

            if (inputTo) inputTo.value = recipientText;
            if (inputCc) inputCc.value = ccText;
            if (inputSubject) inputSubject.value = subjectText;
            if (inputBody) inputBody.value = bodyText;

            const aiConfidence = document.getElementById('aiConfidence');
            if (aiConfidence) {
                aiConfidence.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> IA Gemini + SQL: Procesado y Enviado`;
            }

            setWidgetState('idle', `✅ Enviado a ${toName || toEmail || 'destinatario'}`);
            showToast(`✉️ ¡Correo enviado directamente a ${recipientText}!`, "success");
            return;
        }

        // Respuesta no catalogada
        setWidgetState('idle', "Listo para escuchar...");

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log("Petición abortada por el usuario.");
            return;
        }

        console.error("Error al conectar con /voice:", error);
        showToast(
            `No se pudo conectar al servidor en ${API_BASE_URL}. Verifica que esté activo con: uvicorn prueba:app --reload`,
            "error"
        );
        setWidgetState('idle', "Error de conexión");
    } finally {
        clearTimeout(safetyTimeout);
        // Si el estado aún no volvió a idle, regresarlo
        if (currentState !== 'idle') {
            setWidgetState('idle');
        }
    }
}

/**
 * Corta el audio y pasa al estado 'processing' de inmediato
 */
async function stopVoiceRecording() {
    if (currentState !== 'recording') return;

    // Cambiar inmediatamente a 'processing' (el botón muestra spinner violeta)
    setWidgetState('processing');
    showToast("Audio cortado. Procesando con IA...", "info");

    try {
        await fetch(`${API_BASE_URL}/stop_voice`, { method: 'GET' });
    } catch (e) {
        console.warn("Aviso: no se pudo notificar /stop_voice al backend:", e);
    }
}

/**
 * Cancela cualquier proceso en curso y reinicia el widget al estado inicial
 */
async function cancelAndReset(message = "Grabación cancelada y reiniciada.") {
    console.log("Reiniciando widget...");

    if (abortController) {
        abortController.abort();
        abortController = null;
    }

    try {
        fetch(`${API_BASE_URL}/stop_voice`, { method: 'GET' }).catch(() => {});
    } catch (_) {}

    setWidgetState('idle', "Listo para escuchar...");
    showToast(message, "info");
}

/**
 * Manejador principal al hacer clic en el botón de micrófono (#micBtn)
 */
function handleMicButtonClick() {
    if (currentState === 'idle') {
        // Estado 1: Iniciar grabación
        startVoiceRecording();
    } else if (currentState === 'recording') {
        // Estado 2: Terminar de hablar y cortar audio
        stopVoiceRecording();
    } else if (currentState === 'processing') {
        // Estado 3: Cancelar proceso y reiniciar inmediatamente
        cancelAndReset("Proceso cancelado. Listo para iniciar de nuevo.");
    }
}

/**
 * Muestra u oculta la tarjeta desplegable de vista previa
 */
function togglePreview() {
    isPreviewOpen = !isPreviewOpen;
    const card = document.getElementById('previewCard');
    const chevron = document.getElementById('expandChevron');

    if (!card) return;

    if (isPreviewOpen) {
        card.classList.remove('hidden');
        setTimeout(() => {
            card.classList.remove('translate-y-4', 'opacity-0');
        }, 10);
        if (chevron) chevron.classList.add('rotate-180');
    } else {
        card.classList.add('translate-y-4', 'opacity-0');
        if (chevron) chevron.classList.remove('rotate-180');
        setTimeout(() => {
            card.classList.add('hidden');
        }, 300);
    }
}

/**
 * Confirmación o reenvío manual desde la tarjeta
 */
function sendEmail() {
    const to = document.getElementById('emailTo')?.value;
    if (!to) {
        showToast("Falta especificar el destinatario.", "error");
        return;
    }

    const statusText = document.getElementById('statusText');
    if (statusText) statusText.innerText = "¡Correo enviado!";
    showToast("Correo confirmado a " + to, "success");
    
    setTimeout(() => {
        if (isPreviewOpen) togglePreview();
        const st = document.getElementById('statusText');
        if (st) st.innerText = "Listo para escuchar...";
    }, 1500);
}

/**
 * Simulación de voz con frase de prueba
 */
function simulateUserVoice() {
    if (currentState !== 'idle') {
        cancelAndReset();
        return;
    }

    setWidgetState('recording');
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.innerText = "Simulando voz...";

    setTimeout(() => {
        setWidgetState('processing');
        setTimeout(() => {
            const inputTo = document.getElementById('emailTo');
            const inputCc = document.getElementById('emailCc');
            const inputSubject = document.getElementById('emailSubject');
            const inputBody = document.getElementById('emailBody');

            if (inputTo) inputTo.value = "JOSE GONZALEZ <ytpolloorcado@gmail.com>";
            if (inputCc) inputCc.value = "JUAN PEREZ";
            if (inputSubject) inputSubject.value = "Recordatorio: Actividad pendiente";
            if (inputBody) inputBody.value = "Hola José,\n\nTe recuerdo que mañana realices la actividad encargada ayer.\n\nSaludos.";

            setWidgetState('idle', "¡Ejemplo enviado!");
            showToast("Ejemplo simulado enviado con éxito.", "success");
        }, 1200);
    }, 1200);
}

/**
 * Despliega notificaciones tipo Toast
 */
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const colorClasses = type === 'success' 
        ? 'bg-emerald-600/90 border-emerald-500/50' 
        : type === 'info'
        ? 'bg-indigo-600/90 border-indigo-500/50'
        : 'bg-rose-600/90 border-rose-500/50';

    const iconClass = type === 'success' 
        ? 'fa-circle-check text-emerald-200' 
        : type === 'info'
        ? 'fa-circle-info text-indigo-200'
        : 'fa-circle-exclamation text-rose-200';

    toast.className = `pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-xs font-medium text-white border transition-all transform translate-y-2 opacity-0 ${colorClasses}`;
    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);

    setTimeout(() => {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Inicialización al cargar el DOM
 */
document.addEventListener('DOMContentLoaded', () => {
    // Botón de micrófono principal: Control de inicio / corte / reinicio
    const micBtn = document.getElementById('micBtn');
    if (micBtn) {
        micBtn.addEventListener('click', handleMicButtonClick);
    }

    // Botón "Terminar" de la barra de grabación
    const stopRecordingBtn = document.getElementById('stopRecordingBtn');
    if (stopRecordingBtn) {
        stopRecordingBtn.addEventListener('click', stopVoiceRecording);
    }

    // Botón "Cancelar" (x) de la barra de grabación
    const cancelRecordingBtn = document.getElementById('cancelRecordingBtn');
    if (cancelRecordingBtn) {
        cancelRecordingBtn.addEventListener('click', () => {
            cancelAndReset("Grabación cancelada.");
        });
    }

    // Botón de reinicio rápido en la barra principal
    const btnResetVoice = document.getElementById('btnResetVoice');
    if (btnResetVoice) {
        btnResetVoice.addEventListener('click', () => {
            cancelAndReset("Asistente reiniciado.");
        });
    }

    // Botón de cerrar vista previa
    const closeBtn = document.getElementById('closePreviewBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', togglePreview);
    }

    // Botón de confirmar/enviar correo
    const sendBtn = document.getElementById('sendEmailBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', sendEmail);
    }

    // Botón demo
    const demoBtn = document.getElementById('demoVoiceBtn');
    if (demoBtn) {
        demoBtn.addEventListener('click', simulateUserVoice);
    }

    // Botón expandir/colapsar preview
    const expandBtn = document.getElementById('expandToggleBtn');
    if (expandBtn) {
        expandBtn.addEventListener('click', togglePreview);
    }
});
