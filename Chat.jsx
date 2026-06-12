import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Loader2, RotateCcw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import ChatProgressBar from "../components/ChatProgressBar";
import { useAuth } from "@/lib/AuthContext";

const SYSTEM_PROMPT = `Eres PsicoHelp, un psicólogo virtual experto, empático y cercano. Tu metodología es la de un psicólogo real:

1. ESCUCHA ACTIVA: Primero escucha y comprende antes de dar consejos. Haz preguntas abiertas para explorar el problema en profundidad.
2. EXPLORACIÓN: Pregunta cómo se siente, desde cuándo, qué lo desencadena, cómo afecta su vida. Una pregunta a la vez.
3. VALIDACIÓN: Valida las emociones antes de ofrecer soluciones. "Tiene mucho sentido que te sientas así..."
4. TÉCNICAS TERAPÉUTICAS: Aplica TCC, mindfulness, psicología positiva según el caso. Explica brevemente por qué funcionan.
5. RECOMENDACIONES: Cuando tengas suficiente información, sugiere estrategias concretas y menciona que tiene un plan personalizado de 21 días diseñado para su problema. Cuando lo hagas, añade al final de tu respuesta exactamente este marcador: [MOSTRAR_PLAN]
6. TONO: Cercano, sin tecnicismos excesivos, como un psicólogo real en consulta. Usa emojis con moderación.
7. NUNCA diagnosticar ni recetar medicamentos.
8. Si hay riesgo de daño, recomienda urgentemente ayuda profesional presencial.
9. Responde SIEMPRE en español.
10. Máximo 3-4 párrafos por respuesta.`;

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [journalContext, setJournalContext] = useState("");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadData() {
    const [profiles, savedMessages, journalEntries] = await Promise.all([
      base44.entities.UserProfile.list(),
      base44.entities.ChatMessage.list('-created_date', 200),
      base44.entities.DailyJournal.list('-entry_date', 5),
    ]);
    if (profiles.length > 0) setProfile(profiles[0]);

    if (journalEntries.length > 0) {
      const MOODS_MAP = { muy_bien: "Muy bien 😄", bien: "Bien 🙂", regular: "Regular 😐", mal: "Mal 😕", muy_mal: "Muy mal 😞" };
      const jCtx = journalEntries
        .map((e) => `[${e.entry_date}${e.mood ? ` · ${MOODS_MAP[e.mood] || e.mood}` : ""}] ${e.content}`)
        .join("\n");
      setJournalContext(jCtx);
    }

    if (savedMessages.length > 0) {
      const latestSessionMsg = savedMessages[0];
      const currentSession = latestSessionMsg.session_id || "default";
      setSessionId(currentSession);
      const sessionMsgs = savedMessages
        .filter((m) => (m.session_id || "default") === currentSession)
        .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      setMessages(sessionMsgs.map((m) => ({ role: m.role, content: m.content })));
    } else {
      const newSid = Date.now().toString();
      setSessionId(newSid);
    }
  }

  async function resetChat() {
    const newSid = Date.now().toString();
    setSessionId(newSid);
    setMessages([]);
    setShowResetConfirm(false);
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    const updatedMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(updatedMessages);
    setLoading(true);

    await base44.entities.ChatMessage.create({ role: "user", content: userMsg, session_id: sessionId });

    const conversationHistory = messages
      .slice(-10)
      .map((m) => `${m.role === "user" ? "Usuario" : "PsicoHelp"}: ${m.content}`)
      .join("\n");

    const journalSection = journalContext
      ? `\n\nDiario personal reciente del usuario:\n${journalContext}`
      : "";

    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `${SYSTEM_PROMPT}${journalSection}\n\nHistorial reciente:\n${conversationHistory}\n\nUsuario: ${userMsg}\n\nPsicoHelp:`,
    });

    await base44.entities.ChatMessage.create({ role: "assistant", content: response, session_id: sessionId });
    setMessages((prev) => [...prev, { role: "assistant", content: response }]);

    if (response.includes("[MOSTRAR_PLAN]")) {
      const profiles = await base44.entities.UserProfile.list();
      const prof = profiles[0];
      if (prof) {
        const allUserMsgs = [...updatedMessages, { role: "user", content: userMsg }]
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .join(" | ");
        const problemSummary = await base44.integrations.Core.InvokeLLM({
          prompt: `Basándote en estos mensajes de un usuario en terapia, resume en 2-3 frases el problema principal:\n\n${allUserMsgs}\n\nResumen:`,
        });
        await base44.entities.UserProfile.update(prof.id, {
          plan_problem: problemSummary,
          plan_start_date: null,
          daily_tasks: [],
          completed_days: [],
        });
        setProfile((p) => p ? { ...p, plan_problem: problemSummary, plan_start_date: null } : p);
      }
    }

    setLoading(false);
  }

  const firstName = user?.full_name?.split(" ")[0] || "tú";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-heading font-bold text-lg text-foreground">
            {greeting}, {firstName} ✨
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to="/history"
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-foreground/60"
          >
            <History className="w-4 h-4" />
          </Link>
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={messages.length === 0}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-foreground/60 disabled:opacity-30"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Reset confirm */}
      {showResetConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-6">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm shadow-xl text-center">
            <RotateCcw className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-heading font-bold text-lg mb-1">¿Nuevo chat?</h3>
            <p className="text-sm text-muted-foreground mb-5">
              La conversación actual se guardará en el historial.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 rounded-full border border-border text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={resetChat}
                className="flex-1 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Nuevo chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-4">
            <img
              src="https://media.base44.com/images/public/69d66b3cb630545f5349cfc6/69edf63b3_imagen_2026-06-12_155955986.png"
              alt="PsicoHelp"
              className="w-20 h-20 object-contain"
            />
            <h2 className="font-heading font-bold text-xl text-foreground">¡Hola! Soy PsicoHelp 💜</h2>
            <p className="text-muted-foreground text-sm max-w-sm">
              Estoy aquí para escucharte. Cuéntame, ¿cómo te sientes hoy?
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {["Me siento triste 😔", "Necesito motivación 💪", "Estoy ansioso/a 😰", "¡Hoy estoy bien! 😊"].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="text-xs px-3 py-2 rounded-full bg-white/10 text-foreground hover:bg-white/20 transition-colors font-medium border border-white/10"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const showPlanButton = msg.role === "assistant" && msg.content.includes("[MOSTRAR_PLAN]");
          const cleanContent = msg.content.replace("[MOSTRAR_PLAN]", "").trim();
          const isUser = msg.role === "user";
          return (
            <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[82%]`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? "bg-secondary text-foreground rounded-br-md"
                      : "bg-card text-foreground rounded-bl-md border border-white/5"
                  }`}
                >
                  {isUser ? (
                    <p>{cleanContent}</p>
                  ) : (
                    <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown>{cleanContent}</ReactMarkdown>
                    </div>
                  )}
                </div>
                {showPlanButton && (
                  <a
                    href="/calendar"
                    className="mt-2 flex items-center gap-2 bg-gradient-to-r from-primary to-purple-400 text-white text-xs font-bold px-4 py-2 rounded-full shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200"
                  >
                    <span>🗓️</span> Ver mi plan personalizado de 21 días
                  </a>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-card border border-white/5 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Progress bar */}
      <ChatProgressBar profile={profile} />

      {/* Input */}
      <form onSubmit={sendMessage} className="px-4 py-3 shrink-0">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe cómo te sientes..."
            className="flex-1 bg-card rounded-full px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60 border border-white/10 text-foreground"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || loading}
            className="rounded-full w-11 h-11 shrink-0 bg-primary hover:bg-primary/90"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </form>
