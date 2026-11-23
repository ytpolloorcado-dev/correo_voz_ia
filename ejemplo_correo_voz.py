import pandas as pd
from sqlalchemy.pool import NullPool
from email import encoders
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email import encoders
import smtplib
from sqlalchemy import text
from sqlalchemy import create_engine
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys
import threading
import math
import time
import audioop
from google import genai as ia
import speech_recognition as sr


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

stop_recording_event = threading.Event()

@app.get("/stop_voice")
def detener_grabacion():
    """Endpoint para que el widget corte el audio inmediatamente cuando el usuario termina de hablar."""
    stop_recording_event.set()
    return {"status": 200, "message": "Grabación cortada exitosamente"}

@app.get("/voice")
def escuchar():
    conexion = create_engine(
        "cadena_de_conexion_de_sql",
        poolclass=NullPool,
        pool_pre_ping=True,
        connect_args={"timeout": 10}
    )

    stop_recording_event.clear()

    try:
        recognizer = sr.Recognizer()

        with sr.Microphone() as source:
            print("Calibrando micrófono contra ruido de fondo...")
            recognizer.adjust_for_ambient_noise(source, duration=0.5)
            print(" ¡Listo! Habla ahora...")

            seconds_per_buffer = float(source.CHUNK) / source.SAMPLE_RATE
            # 0.7 segundos de silencio tras hablar para cortar automáticamente
            pause_buffer_count = int(math.ceil(0.7 / seconds_per_buffer))
            frames = []
            has_spoken = False
            silence_buffers = 0
            start_time = time.time()

            while not stop_recording_event.is_set():
                if time.time() - start_time > 30:
                    print("Tiempo máximo alcanzado (30s).")
                    break

                if not has_spoken and (time.time() - start_time > 8):
                    print("Timeout: no se detectó inicio de voz.")
                    break

                try:
                    buffer = source.stream.read(source.CHUNK)
                except Exception:
                    break

                if not buffer:
                    break
                frames.append(buffer)

                try:
                    energy = audioop.rms(buffer, source.SAMPLE_WIDTH)
                except Exception:
                    energy = 0

                if energy > recognizer.energy_threshold:
                    has_spoken = True
                    silence_buffers = 0
                else:
                    if has_spoken:
                        silence_buffers += 1
                        if silence_buffers > pause_buffer_count:
                            print("Silencio detectado tras hablar. Cortando grabación automáticamente.")
                            break

            if stop_recording_event.is_set():
                print("Grabación cortada por petición del usuario desde el widget.")

            if len(frames) == 0:
                return {
                    "Status": 404,
                    "Message": "No se detectó audio en la grabación. Intenta de nuevo."
                }

            audio = sr.AudioData(b"".join(frames), source.SAMPLE_RATE, source.SAMPLE_WIDTH)

        try:
            # Enviamos el audio a Google especificando que hablas español de México
            texto = recognizer.recognize_google(audio, language="es-MX")

        except sr.UnknownValueError:
            return { 
                "Status": 404,
                "Message": "No entendí lo que dijiste. ¿Hablaste muy quedito o hubo mucho ruido?"
            }
        except sr.RequestError:
            return {
                "Status": 404,
                "Message": "Hubo un error de conexión con el servicio de reconocimiento de voz."
            }

        prompt = f"""
        Hola, quiero que sigas las siguientes indicaciones:
        Me envias ubicamente en formato JSON de la siguiente manera:
        {{
        "To":"correo de la persona",
        "Subject": "Asunto adecuado al contexto",
        "Body": "Correo redactado adecuado al contexto. IMPORTANTE: incluir saltos de linea '\\n' en cada parrafo del cuerpo",
        "NameTo": "envias el nombre de la persona a enviar el correo,TODO el nombre en mayusculas y escrito correctamente, ejemplo si lleva tilde le pones tilde, si lleva ñ le pones ñ, todo en español latino mexico",
        "NameCc": "envias el nombre de la persona de quien te pida copia a enviar el correo, si no hay persona para copiar mandas null",
        "NameCco": "envias el nombre de la persona de quien te pida copia oculta a enviar el correo, si no hay persona para copiar mandas null"
        }}
        El contexto que seguiras sera de este parametro: {texto} 
        """

        cliente = ia.Client(api_key="clave_api_key_de_la_ia")

        # Intentar con modelos Gemini disponibles con reintento automático
        modelos = ["gemini-3.6-flash", "gemini-3.6-flash", "gemini-3.6.0-flash", "gemini-3.6-flash"]
        respuesta = None
        for mod in modelos:
            try:
                respuesta = cliente.models.generate_content(
                    model=mod,
                    contents=prompt,
                    config={"response_mime_type": "application/json"}
                )
                if respuesta and respuesta.text:
                    break
            except Exception as gem_err:
                print(f"Aviso con {mod}: {gem_err}. Probando siguiente modelo...")

        if not respuesta or not respuesta.text:
            return {
                "status": 502,
                "message": "Error",
                "Request": "No se pudo generar la respuesta con Gemini en este momento."
            }

        json_salida = json.loads(respuesta.text)
        parameter = f'%{json_salida.get("NameTo", "")}%'

        consulta = text("""
            WITH Empleados_INF AS(
            SELECT t1.EmpleadoID,UPPER(CONCAT(NOMBRE,' ',APELLIDO,' ')) AS NOM_COMPLETO,correo
                FROM Empleados t1
            INNER JOIN EmpleadosInfo t2
                ON t1.EmpleadoID
                    = t2.EmpleadoID)
                SELECT * FROM Empleados_INF
            WHERE NOM_COMPLETO
            LIKE :NOM_COMPLETO
            ;
        """)

        output_query = pd.read_sql(consulta, conexion, params={"NOM_COMPLETO": parameter})

        # Determinar destinatario:
        # 1. Si está en la base de datos SQL, usar su correo
        # 2. Si vino un correo explícito en la instrucción de voz
        # 3. Si no está en BD (ej. al probar con "Jose Gonzalez"), usar ytpolloorcado@gmail.com
        destinatario = None
        if not output_query.empty and "correo" in output_query.columns:
            destinatario = output_query["correo"].iloc[0]
            json_salida["To"] = destinatario
        elif json_salida.get("To") and "@" in str(json_salida.get("To")) and "ejemplo.com" not in str(json_salida.get("To")):
            destinatario = json_salida["To"]
        else:
            print(f"Empleado '{json_salida.get('NameTo')}' no encontrado en BD. Enviando a ytpolloorcado@gmail.com por defecto.")
            destinatario = "ytpolloorcado@gmail.com"
            json_salida["To"] = destinatario

        print(f"Destinatario final resuelto: {destinatario}")

        msg = MIMEMultipart()
        msg["From"] = "destinatario@gmail.com"
        msg["To"] = destinatario
        msg["Subject"] = json_salida.get("Subject", "Mensaje de Voz")
        body = json_salida.get("Body", "")
        msg.attach(MIMEText(body, "plain"))

        # Conectar y enviar SMTP directamente (sin necesidad de confirmación previa)
        try:
            conectar_smtp = smtplib.SMTP(host='smtp.gmail.com', port=587, timeout=10)
            conectar_smtp.starttls()
            conectar_smtp.login(user='usuario_example@gmail.com', password='contrasena_de_coreo (si es de google pongo la clave de aplicacion, si es de outlook la contraseña por defecto)')
            conectar_smtp.send_message(msg)
            conectar_smtp.quit()
            print(f""Correo enviado exitosamente a {destinatario}")
        except Exception as smtp_err:
            print(f"Error al enviar por SMTP: {smtp_err}")
            return {
                "status": 502,
                "message": "Error SMTP",
                "Request": f"Error al enviar correo por Gmail: {str(smtp_err)}"
            }

        intentos = 3
        for i in range(intentos):
            try:
                return{
                    "status": 202,
                    "message":"Success",
                    "Request": json_salida
                }
            except Exception as e:
                if i == intentos-1:
                    return{
                        "status": 502,
                        "message":"Error",
                        "Request": str(e)
                    }
    except Exception as error_principal:
        return{
            "status": 502,
            "message":"Error",
            "Request": str(error_principal)
        }
