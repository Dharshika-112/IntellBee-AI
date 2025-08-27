# backend/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
import os
import json
from datetime import datetime, timedelta
from dotenv import load_dotenv  # Required to load .env
import jwt
from functools import wraps

# Load environment variables from backend/.env explicitly
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, '.env')
load_dotenv(dotenv_path=ENV_PATH)

app = Flask(__name__)
CORS(app)

# Secrets and Config
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY not found! Make sure backend/.env exists and has the key.")

SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-me")
TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # default 1 day

print("API Key loaded successfully")

# Configure Gemini
try:
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('models/gemini-1.5-flash-latest')
    print("Gemini model loaded")
except Exception as e:
    raise RuntimeError(f"Failed to load Gemini model: {e}")

DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'data'))
HISTORY_FILE = os.path.join(DATA_DIR, 'conversations.json')
USERS_FILE = os.path.join(DATA_DIR, 'users.json')

# Ensure data directory and baseline files exist
os.makedirs(DATA_DIR, exist_ok=True)
if not os.path.exists(HISTORY_FILE):
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump({"users": {}}, f)
if not os.path.exists(USERS_FILE):
    with open(USERS_FILE, 'w', encoding='utf-8') as f:
        json.dump({"users": []}, f)

# ---------------------- Auth helpers ----------------------

def generate_token(email: str) -> str:
    payload = {
        "sub": email,
        "exp": (datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES))
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> str:
    data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    return data.get("sub")


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
        token = auth_header.split(" ", 1)[1]
        try:
            email = decode_token(token)
            request.user_email = email  # attach to request
        except Exception:
            return jsonify({"error": "Invalid or expired token"}), 401
        return fn(*args, **kwargs)
    return wrapper

# ---------------------- File I/O ----------------------

def read_json(path, default):
    try:
        if not os.path.exists(path):
            return default
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


# History structure: { users: { "email": { conversations: [ ... ] } } }

def load_user_history(email: str):
    store = read_json(HISTORY_FILE, {"users": {}})
    users = store.get("users", {})
    return store, users.get(email, {"conversations": []})


def save_user_history(email: str, history_obj):
    store = read_json(HISTORY_FILE, {"users": {}})
    if "users" not in store:
        # migrate from old structure { conversations: [...] }
        old = store
        store = {"users": {}}
        store["users"][email] = old
    store.setdefault("users", {})
    store["users"][email] = history_obj
    write_json(HISTORY_FILE, store)


def load_users():
    data = read_json(USERS_FILE, {"users": []})
    return data.get("users", [])


def save_users(users_list):
    write_json(USERS_FILE, {"users": users_list})


def find_user(users_list, email):
    return next((u for u in users_list if u.get("email") == email), None)

# ---------------------- Auth endpoints ----------------------

@app.route("/api/auth/signup", methods=["POST"])
def signup():
    data = request.json or {}
    name = (data.get("name") or "").strip()
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    if not name or not email or not password:
        return jsonify({"error": "Name, email and password required"}), 400

    users = load_users()
    if any(u.get("email") == email for u in users):
        return jsonify({"error": "User already exists"}), 409

    # Demo only: plaintext password. Use hashing in production.
    new_user = {
        "name": name,
        "username": username or name.split(" ")[0],
        "email": email,
        "password": password,
        "prefs": {"lang": "en-US", "voiceGender": "female"}
    }
    users.append(new_user)
    save_users(users)

    token = generate_token(email)
    return jsonify({"token": token, "email": email, "name": name, "username": new_user["username"], "prefs": new_user["prefs"]})


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    users = load_users()
    user = find_user(users, email)
    if not user or user.get("password") != password:
        return jsonify({"error": "Invalid credentials"}), 401

    token = generate_token(email)
    return jsonify({"token": token, "email": email, "name": user.get("name"), "username": user.get("username"), "prefs": user.get("prefs", {})})


@app.route("/api/user/me", methods=["GET"])
@require_auth
def get_me():
    email = getattr(request, "user_email", None)
    users = load_users()
    user = find_user(users, email)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"email": user.get("email"), "name": user.get("name"), "username": user.get("username"), "prefs": user.get("prefs", {})})


@app.route("/api/user/prefs", methods=["POST"])
@require_auth
def set_prefs():
    email = getattr(request, "user_email", None)
    data = request.json or {}
    lang = (data.get("lang") or "").strip()
    voice_gender = (data.get("voiceGender") or "").strip()

    allowed_langs = {"en-US", "ta-IN", "hi-IN"}
    users = load_users()
    user = find_user(users, email)
    if not user:
        return jsonify({"error": "User not found"}), 404

    prefs = user.setdefault("prefs", {})
    if lang and lang in allowed_langs:
        prefs["lang"] = lang
    if voice_gender in {"male", "female"}:
        prefs["voiceGender"] = voice_gender

    save_users(users)
    return jsonify({"ok": True, "prefs": prefs})

# ---------------------- Chat endpoints ----------------------

@app.route("/api/chat", methods=["POST"])
@require_auth
def chat():
    user_email = getattr(request, "user_email", None)

    # Determine if JSON or multipart
    is_multipart = request.content_type and request.content_type.startswith("multipart/form-data")

    if is_multipart:
        message = request.form.get("message", "").strip()
        chat_id = request.form.get("chat_id")
        lang = (request.form.get("lang") or "").strip()
        image_file = request.files.get("image")
        audio_file = request.files.get("audio")
    else:
        data = request.json or {}
        message = (data.get("message") or "").strip()
        chat_id = data.get("chat_id")
        lang = (data.get("lang") or "").strip()
        image_file = None
        audio_file = None

    if not message and not image_file and not audio_file:
        return jsonify({"error": "No message, image or audio provided"}), 400

    # Fall back to user's preferred language if not provided
    if not lang:
        users = load_users()
        user = find_user(users, user_email)
        lang = (user or {}).get("prefs", {}).get("lang", "en-US")

    store, history = load_user_history(user_email)
    chat = next((c for c in history["conversations"] if c["id"] == chat_id), None)

    if not chat:
        title_seed = message or (image_file.filename if image_file else audio_file.filename if audio_file else "Chat")
        chat = {"id": f"chat_{len(history['conversations'])}", "title": title_seed[:30], "messages": [], "created": datetime.now().isoformat()}
        history["conversations"].insert(0, chat)
    else:
        history["conversations"].remove(chat)
        history["conversations"].insert(0, chat)

    if message:
        chat["messages"].append({"role": "user", "content": message})

    # Build recent context (last 8 messages)
    recent = chat["messages"][-8:]
    context_lines = []
    for m in recent:
        role = "User" if m["role"] == "user" else "Assistant"
        context_lines.append(f"{role}: {m['content']}")
    context_text = "\n".join(context_lines)

    try:
        parts = []
        system_preamble = (
            f"You are INTELLBEE. Always respond in {lang}.\n"
            f"Give thorough, structured, step-by-step, long and detailed answers with examples when helpful.\n"
            f"Use the recent conversation context to remain consistent.\n\nContext:\n{context_text}\n\n"
        )
        user_instruction = (message or "").strip()

        # Append image if present
        if image_file:
            img_bytes = image_file.read()
            parts.append({"mime_type": image_file.mimetype or "image/png", "data": img_bytes})
            if not user_instruction:
                user_instruction = "Describe this image in detail."

        # Append audio if present
        if audio_file:
            aud_bytes = audio_file.read()
            parts.append({"mime_type": audio_file.mimetype or "audio/webm", "data": aud_bytes})
            if not user_instruction:
                user_instruction = "Transcribe and analyze this audio in detail."

        # Compose final content for Gemini 1.5 (supports multimodal parts)
        content = [system_preamble]
        if user_instruction:
            content.append(user_instruction)
        # binary parts go as dicts
        content.extend(parts)

        response = model.generate_content(content)
        ai_text = response.text.strip()
        chat["messages"].append({"role": "model", "content": ai_text})
        save_user_history(user_email, history)
        return jsonify({"response": ai_text, "chat_id": chat["id"], "conversations": history["conversations"]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/history", methods=["GET"])
@require_auth
def get_history():
    user_email = getattr(request, "user_email", None)
    _, history = load_user_history(user_email)
    return jsonify({"conversations": history.get("conversations", [])})


if __name__ == "__main__":
    print("Starting ChatGemini Backend...")
    print(f"API Key prefix: {api_key[:10]}... (hidden)")
    app.run(host="0.0.0.0", port=5001, debug=True)