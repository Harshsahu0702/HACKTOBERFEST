import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Mic,
  MicOff,
  Send,
  Trash2,
  X,
  Minus,
  MapPin,
  Video,
  FileText,
  Zap,
  ShieldAlert,
  Car,
  TrendingUp,
  MessageSquare,
  Bot,
  Heart,
} from "lucide-react";
import { api } from "../services/api";
import "./DrishtiGptCopilot.css";

/* =========================================================================
   CUTE OUT-OF-THE-BOX AI BOT MASCOT AVATAR (Interactive & Expressive)
   ========================================================================= */
function CuteBotMascot({ isHovered = false, size = 32 }) {
  return (
    <div className={`cute-bot-mascot ${isHovered ? "hovered" : ""}`}>
      <svg
        viewBox="0 0 44 44"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="cute-bot-svg"
      >
        <defs>
          <linearGradient id="cuteBotBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="cuteVisorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>

        {/* Floating Glowing Antenna */}
        <circle cx="22" cy="5" r="3.2" fill="#38bdf8" className="bot-antenna-beacon" />
        <line x1="22" y1="8" x2="22" y2="12" stroke="#cbd5e1" strokeWidth="2.2" strokeLinecap="round" />

        {/* Head Shell */}
        <rect
          x="6"
          y="11"
          width="32"
          height="28"
          rx="14"
          fill="url(#cuteBotBodyGrad)"
          stroke="#ffffff"
          strokeWidth="1.2"
        />

        {/* Headphone Ears */}
        <rect x="3" y="19" width="4" height="11" rx="2" fill="#2563eb" />
        <rect x="37" y="19" width="4" height="11" rx="2" fill="#2563eb" />

        {/* Dark Visor */}
        <rect
          x="10"
          y="15"
          width="24"
          height="19"
          rx="9.5"
          fill="url(#cuteVisorGrad)"
          stroke="#475569"
          strokeWidth="1"
        />

        {/* Expressive Eyes */}
        <ellipse cx="16" cy="22" rx="2.5" ry="3.5" fill="#38bdf8" />
        <circle cx="15.2" cy="20.5" r="1" fill="#ffffff" />

        <ellipse cx="28" cy="22" rx="2.5" ry="3.5" fill="#38bdf8" />
        <circle cx="27.2" cy="20.5" r="1" fill="#ffffff" />

        {/* Cute Smile */}
        <path
          d="M19.5 26.5 Q22 29 24.5 26.5"
          stroke="#93c5fd"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

export function DrishtiGptCopilot({
  isOpen,
  onClose,
  onOpen,
  onTraceVehicle,
  onPlayEvidence,
  onOpenDossier,
  onIssueChallan,
  onSelectCamera,
  onSwitchTab,
  onOpenAddBlacklist,
}) {
  const [messages, setMessages] = useState([
    {
      id: "initial_greeting",
      sender: "assistant",
      text: `### DRISHTI AI Assistant\n\nMain **DRISHTI AI Assistant** hoon ✨\n\nAap mujhse **Naye Features**, **Live Webcam ANPR**, **2D GIS Corridor Map**, vehicle tracking (e.g. \`WB37E1275\`), speed calculation, ya project architecture ke baare mein kuch bhi pooch sakte ho!\n\nNeeche diye suggestions try karein ya message type karein.`,
      quickChips: [
        "✨ Naye features kya hain?",
        "📷 Live ANPR open karo",
        "🗺️ 2D GIS Corridor",
        "DRISHTI kya hai?",
        "Accuracy kitni hai?",
        "Architecture explain karo",
      ],
    },
  ]);

  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const [isPillHovered, setIsPillHovered] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  /* Scroll to bottom when messages update */
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [messages, isOpen]);

  /* Initialize Speech Recognition */
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      setRecognitionSupported(true);
      const recognizer = new SpeechRecognition();
      recognizer.continuous = false;
      recognizer.interimResults = false;
      recognizer.lang = "en-IN";

      recognizer.onstart = () => {
        setIsVoiceActive(true);
      };

      recognizer.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputValue(transcript);
          handleSendMessage(transcript);
        }
      };

      recognizer.onerror = (event) => {
        console.warn("[Copilot Voice Error]:", event.error);
        setIsVoiceActive(false);
      };

      recognizer.onend = () => {
        setIsVoiceActive(false);
      };

      recognitionRef.current = recognizer;
    }
  }, []);

  /* Toggle Speech Recognition */
  const handleToggleVoice = () => {
    if (!recognitionRef.current) return;

    if (isVoiceActive) {
      recognitionRef.current.stop();
      setIsVoiceActive(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsVoiceActive(true);
      } catch (e) {
        console.warn("Failed to start voice recognition:", e);
      }
    }
  };

  /* Send Message to FastAPI Backend */
  const handleSendMessage = async (queryText) => {
    const query = (queryText || inputValue || "").trim();
    if (!query) return;

    const userMsg = {
      id: `user_${Date.now()}`,
      sender: "user",
      text: query,
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputValue("");
    setLoading(true);

    try {
      const response = await api.askDrishtiGpt(query, {
        session_id: "drishti_chat_session",
        history: newHistory.slice(-8).map((m) => ({
          sender: m.sender,
          text: m.text,
        })),
      });

      const assistantMsg = {
        id: `assist_${Date.now()}`,
        sender: "assistant",
        text: response.reply,
        speechText: response.speech_text,
        cards: response.cards || [],
        suggestedActions: response.suggested_actions || [],
        quickChips: response.quickChips || response.quick_chips || [],
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.warn("[Copilot API Failed, using client conversational fallback]:", err);
      const fallbackReply = generateClientFallback(query);
      setMessages((prev) => [...prev, fallbackReply]);
    } finally {
      setLoading(false);
    }
  };

  /* Client-Side Conversational Fallback */
  const generateClientFallback = (query) => {
    const qLower = query.toLowerCase();
    let reply = "";
    let speech = "";
    let suggestedActions = [];

    if (qLower.includes("hello") || qLower.includes("hi") || qLower.includes("namaste") || qLower.includes("bhai")) {
      reply = `Namaste bhai! Main **DRISHTI AI Assistant** hoon ✨\n\nAap mujhse **Naye Features**, **Live Webcam ANPR**, **2D GIS Map**, YOLOv8 pipeline, OCR accuracy, ya vehicle tracking ke bare me pooch sakte ho!`;
      speech = "Hello! DRISHTI AI Assistant is online. How can I help you today?";
    } else if (qLower.includes("naya feature") || qLower.includes("naye feature") || qLower.includes("new feature") || qLower.includes("update") || qLower.includes("kya naya")) {
      reply = `### ✨ DRISHTI — Naye Features & Updates\n\n1. **📷 Live Laptop Webcam ANPR**: Real-time camera scanning with YOLOv8 + PaddleOCR & dual-orientation mirror auto-fallback.\n2. **🗺️ Streamlined 2D Tactical GIS Map**: 60 FPS smooth trajectory animation between Junction A and Junction B with clean text-only camera popups.\n3. **📑 MoRTH VAHAN 4.0 Digital RC**: Complete vehicle ownership, fuel type, PUCC, and tax validation.\n4. **⚡ Automated e-Challan**: 1-click violation notices with dynamic QR code payment.\n5. **⚖️ Section 65B Digital Certificates**: Tamper-evident SHA-256 frame hash certificates for court admissibility.`;
      speech = "DRISHTI now features real-time Live Webcam ANPR, an optimized 2D GIS corridor map, VAHAN 4.0 RC integration, automated e-Challan, and Section 65B evidence certificates.";
      suggestedActions = [
        { label: "📷 Launch Live Webcam ANPR", action: "SWITCH_TAB", payload: { tab: "live_anpr" } },
        { label: "🗺️ Open 2D GIS Map", action: "SWITCH_TAB", payload: { tab: "surveillance" } },
      ];
    } else if (qLower.includes("live anpr") || qLower.includes("webcam") || qLower.includes("camera scan")) {
      reply = `### 📷 Real-Time Live Webcam ANPR Engine\n\n- **Dual-Engine**: YOLOv8 plate detector (\`models/license_plate.pt\`) + PaddleOCR PP-OCRv6.\n- **Dual-Orientation Auto-Fallback**: Browser selfie camera mirror mode ko auto-invert karta hai, taaki phone screen ya paper ka number 100% accurate read ho.\n- **Instant Alerts**: Scanned number ko City Blacklist aur VAHAN 4.0 RC se turant match karta hai.\n\n👉 *Top bar me **'Live ANPR'** tab open karke **'START WEBCAM'** dabayein!*`;
      speech = "Live Webcam ANPR is active. It combines YOLOv8 plate detection with PaddleOCR and auto-mirrored orientation for real-time camera scanning.";
      suggestedActions = [
        { label: "📷 Launch Live Webcam ANPR", action: "SWITCH_TAB", payload: { tab: "live_anpr" } },
      ];
    } else if (qLower.includes("map") || qLower.includes("gis") || qLower.includes("junction")) {
      reply = `### 🗺️ DRISHTI 2D Tactical GIS Map & Trajectory Corridor\n\n- **Dual Junctions**: Junction A (Vivekananda Sarani) aur Junction B (Kanyapur Link Road).\n- **Smooth 60 FPS Trajectory**: Physics-based Haversine speed calculation ke saath continuous animated movement.\n- **Clean Text-Only Pins**: Click karne par instant camera status dikhata hai, zero video playback lag.\n- **Multi-Layers**: Street, ESRI Satellite, aur Dark Cyber Tactical modes.`;
      speech = "DRISHTI map features an optimized 2D GIS corridor connecting Junction A and Junction B with smooth 60 FPS vehicle trajectory and clean camera popups.";
      suggestedActions = [
        { label: "🗺️ Open GIS Route Map", action: "SWITCH_TAB", payload: { tab: "surveillance" } },
      ];
    } else if (qLower.includes("joke")) {
      reply = `Ek driver red light par nahi ruka aur traffic cop ne use pakda:\n\n*Cop:* "Bhai red light nahi dikhi kya?"\n*Driver:* "Sir, red light to dikhi thi... bas aap nahi dikhe!" 😂\n\nDRISHTI ka computer vision 24/7 bina kisi blind spot ke monitor karta hai!`;
      speech = "Haha, here is a traffic joke for you!";
    } else {
      reply = `Aapne poocha: **"${query}"**\n\nDRISHTI city-wide visual intelligence platform Asansol ke 4 CCTV cameras (Vivekananda Sarani & Kanyapur Link Road) ko monitor karta hai (90.97% OCR accuracy).`;
      speech = "I am ready to assist you with the DRISHTI intelligence platform.";
    }

    return {
      id: `assist_fallback_${Date.now()}`,
      sender: "assistant",
      text: reply,
      speechText: speech,
      cards: [],
      suggestedActions: suggestedActions,
      quickChips: [
        "✨ Naye features kya hain?",
        "📷 Live ANPR open karo",
        "🗺️ 2D GIS Corridor",
        "DRISHTI kya hai?",
        "Accuracy kitni hai?",
        "Architecture explain karo",
      ],
    };
  };

  /* Action Executor */
  const handleExecuteAction = (actionObj) => {
    if (!actionObj || !actionObj.action) return;

    switch (actionObj.action) {
      case "TRACE_MAP":
        if (onTraceVehicle && actionObj.payload?.plate) {
          onTraceVehicle(actionObj.payload.plate);
        }
        break;
      case "PLAY_EVIDENCE":
        if (onPlayEvidence && actionObj.payload?.camera_id) {
          onPlayEvidence(
            actionObj.payload.camera_id,
            actionObj.payload.timestamp || 0
          );
        }
        break;
      case "OPEN_DOSSIER":
        if (onOpenDossier && actionObj.payload?.plate) {
          onOpenDossier(actionObj.payload.plate);
        }
        break;
      case "ISSUE_CHALLAN":
        if (onIssueChallan && actionObj.payload?.plate) {
          onIssueChallan(actionObj.payload.plate, actionObj.payload.vehicle);
        }
        break;
      case "OPEN_ADD_BLACKLIST":
        if (onOpenAddBlacklist) {
          onOpenAddBlacklist(actionObj.payload?.plate || "");
        }
        break;
      case "SWITCH_TAB":
        if (onSwitchTab && actionObj.payload?.tab) {
          onSwitchTab(actionObj.payload.tab);
        }
        break;
      case "QUERY_COPILOT":
        if (actionObj.payload?.query) {
          handleSendMessage(actionObj.payload.query);
        }
        break;
      default:
        console.info("[Copilot Action Triggered]:", actionObj);
        break;
    }
  };

  /* Render Markdown formatting inside assistant bubble */
  const renderMarkdown = (content) => {
    if (!content) return null;

    const lines = content.split("\n");
    const elements = [];
    let inTable = false;
    let tableRows = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        inTable = true;
        tableRows.push(trimmed);
        return;
      } else if (inTable) {
        elements.push(renderTable(tableRows, `tbl_${index}`));
        inTable = false;
        tableRows = [];
      }

      if (trimmed.startsWith("### ")) {
        elements.push(
          <h3 key={`h3_${index}`} className="copilot-md-h3">
            {parseInlineFormatting(trimmed.replace("### ", ""))}
          </h3>
        );
      } else if (trimmed.startsWith("## ")) {
        elements.push(
          <h3 key={`h2_${index}`} className="copilot-md-h3">
            {parseInlineFormatting(trimmed.replace("## ", ""))}
          </h3>
        );
      } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        elements.push(
          <li key={`li_${index}`} className="copilot-md-li">
            {parseInlineFormatting(trimmed.substring(2))}
          </li>
        );
      } else if (trimmed.startsWith("> ")) {
        elements.push(
          <blockquote key={`bq_${index}`} className="copilot-md-quote">
            {parseInlineFormatting(trimmed.substring(2))}
          </blockquote>
        );
      } else if (trimmed === "") {
        elements.push(<div key={`sp_${index}`} className="copilot-md-space" />);
      } else {
        elements.push(
          <p key={`p_${index}`} className="copilot-md-p">
            {parseInlineFormatting(line)}
          </p>
        );
      }
    });

    if (inTable) {
      elements.push(renderTable(tableRows, "tbl_end"));
    }

    return elements;
  };

  const renderTable = (rows, key) => {
    if (!rows || rows.length < 2) return null;
    const headerRow = rows[0]
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");
    const dataRows = rows
      .slice(2)
      .map((r) =>
        r
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c !== "")
      )
      .filter((r) => r.length > 0);

    return (
      <div key={key} className="copilot-table-container">
        <table className="copilot-table">
          <thead>
            <tr>
              {headerRow.map((h, i) => (
                <th key={i}>{parseInlineFormatting(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{parseInlineFormatting(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const parseInlineFormatting = (text) => {
    if (!text) return "";
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={i} className="copilot-code-pill">{part.slice(1, -1)}</code>;
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="copilot-strong">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <>
      {/* 1. FLOATING CUTE MASCOT TRIGGER WRAPPER AT BOTTOM-RIGHT */}
      <div
        className="copilot-fab-wrapper"
        onMouseEnter={() => setIsPillHovered(true)}
        onMouseLeave={() => setIsPillHovered(false)}
      >
        {/* Cute Out-Of-The-Box Hover Tooltip Pill */}
        {!isOpen && (
          <div
            className={`copilot-hover-pill ${isPillHovered ? "active" : ""}`}
            onClick={() => onOpen && onOpen()}
            role="button"
            tabIndex={0}
          >
            <div className="copilot-pill-glow"></div>
            <div className="copilot-pill-body">
              <span className="copilot-pill-sparkle">✨</span>
              <span className="copilot-pill-text">Ask me about the project</span>
              <span className="copilot-pill-wave">👋</span>
            </div>
            <div className="copilot-pill-arrow"></div>
          </div>
        )}

        {/* Floating Mascot Button */}
        <button
          type="button"
          className={`copilot-fab-circle ${isOpen ? "open" : ""}`}
          onClick={() => {
            if (isOpen && onClose) {
              onClose();
            } else if (!isOpen && onOpen) {
              onOpen();
            }
          }}
          title={isOpen ? "Minimize Assistant" : "Ask me about the project"}
          aria-label="Ask me about the project"
        >
          <div className="copilot-fab-aura"></div>
          {isOpen ? (
            <X size={24} className="copilot-close-x" />
          ) : (
            <CuteBotMascot isHovered={isPillHovered} size={38} />
          )}
        </button>
      </div>

      {/* 2. CUTE AESTHETIC CHAT MODAL AT BOTTOM-RIGHT */}
      {isOpen && (
        <div
          className="copilot-floating-modal"
          role="dialog"
          aria-modal="true"
        >
          {/* HEADER */}
          <div className="copilot-header">
            <div className="copilot-header-brand">
              <div className="copilot-logo-wrapper">
                <CuteBotMascot size={26} />
              </div>
              <div className="copilot-title-group">
                <h2>DRISHTI AI</h2>
              </div>
            </div>

            <div className="copilot-header-actions">
              {/* Clear Chat */}
              <button
                type="button"
                className="copilot-btn-icon"
                onClick={() => {
                  setMessages([
                    {
                      id: `greet_${Date.now()}`,
                      sender: "assistant",
                      text: "### DRISHTI AI Assistant\nReady for new vehicle search or traffic question!",
                      quickChips: [
                        "DRISHTI kya hai?",
                        "ANPR kaise kaam karta hai?",
                        "Architecture explain karo",
                        "Accuracy kitni hai?",
                      ],
                    },
                  ]);
                }}
                title="Clear Chat"
              >
                <Trash2 size={14} />
              </button>

              {/* Close */}
              <button
                type="button"
                className="copilot-btn-icon"
                onClick={onClose}
                title="Close"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* MESSAGE STREAM */}
          <div className="copilot-messages">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`copilot-msg-row ${msg.sender}`}
              >
                {msg.sender === "user" ? (
                  <div className="copilot-user-bubble">{msg.text}</div>
                ) : (
                  <div className="copilot-assistant-bubble">
                    <div className="copilot-markdown">
                      {renderMarkdown(msg.text)}
                    </div>

                    {/* ACTION CARDS (VEHICLE / ALERT) */}
                    {msg.cards && msg.cards.length > 0 && (
                      <div className="copilot-cards-grid">
                        {msg.cards.map((card, ci) => (
                          <div key={`card_${ci}`} className="copilot-vehicle-card">
                            <div className="copilot-card-thumb">
                              {card.plate_image_url ? (
                                <img
                                  src={card.plate_image_url}
                                  alt={card.plate}
                                  onError={(e) => {
                                    e.target.style.display = "none";
                                  }}
                                />
                              ) : (
                                <Car size={22} className="copilot-card-thumb-placeholder" />
                              )}
                            </div>
                            <div className="copilot-card-details">
                              <div className="copilot-card-plate-row">
                                <span className="copilot-card-plate">{card.plate}</span>
                                <span
                                  className={`copilot-card-badge ${
                                    card.is_blacklisted ? "blacklisted" : "monitored"
                                  }`}
                                >
                                  {card.is_blacklisted ? "WANTED" : "CLEAR"}
                                </span>
                              </div>
                              <div className="copilot-card-meta">
                                {card.speed && <div>Velocity: <strong>{card.speed}</strong></div>}
                                {card.last_seen_camera && (
                                  <div>Node: {card.last_seen_camera}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ACTION BUTTONS (Only when relevant cards exist - never on general conversation!) */}
                    {msg.cards && msg.cards.length > 0 && msg.suggestedActions && msg.suggestedActions.length > 0 && (
                      <div className="copilot-action-buttons">
                        {msg.suggestedActions.map((btn, bi) => (
                          <button
                            key={`act_${bi}`}
                            type="button"
                            className="copilot-btn-action"
                            onClick={() => handleExecuteAction(btn)}
                          >
                            {btn.action === "TRACE_MAP" && <MapPin size={11} />}
                            {btn.action === "PLAY_EVIDENCE" && <Video size={11} />}
                            {btn.action === "OPEN_DOSSIER" && <FileText size={11} />}
                            {btn.action === "ISSUE_CHALLAN" && <Zap size={11} />}
                            {btn.action === "OPEN_ADD_BLACKLIST" && <ShieldAlert size={11} />}
                            {btn.action === "SWITCH_TAB" && <TrendingUp size={11} />}
                            <span>{btn.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* TYPING INDICATOR */}
            {loading && (
              <div className="copilot-msg-row assistant">
                <div className="copilot-assistant-bubble typing">
                  <div className="copilot-typing-indicator">
                    <span className="copilot-typing-label">
                      ✨ DRISHTI is thinking...
                    </span>
                    <div className="copilot-typing-dot dot-1"></div>
                    <div className="copilot-typing-dot dot-2"></div>
                    <div className="copilot-typing-dot dot-3"></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* QUICK SUGGESTION CHIPS */}
          {messages.length > 0 &&
            messages[messages.length - 1].quickChips &&
            messages[messages.length - 1].quickChips.length > 0 && (
              <div className="copilot-quick-chips">
                {messages[messages.length - 1].quickChips.map((chip, idx) => (
                  <button
                    key={`chip_${idx}`}
                    type="button"
                    className="copilot-chip-btn"
                    onClick={() => handleSendMessage(chip)}
                  >
                    <span>✨</span>
                    <span>{chip}</span>
                  </button>
                ))}
              </div>
            )}

          {/* INPUT FORM */}
          <div className="copilot-input-area">
            <form
              className="copilot-input-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(inputValue);
              }}
            >
              {/* SPEECH MIC BUTTON */}
              {recognitionSupported && (
                <button
                  type="button"
                  className={`copilot-btn-mic ${isVoiceActive ? "listening" : ""}`}
                  onClick={handleToggleVoice}
                  title={
                    isVoiceActive
                      ? "Listening... Click to stop"
                      : "Speak voice query"
                  }
                >
                  {isVoiceActive ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
              )}

              <input
                ref={inputRef}
                type="text"
                className="copilot-text-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={
                  isVoiceActive
                    ? "🎙️ Listening... Bolye"
                    : "Ask DRISHTI AI anything about the project..."
                }
                disabled={loading}
              />

              <button
                type="submit"
                className="copilot-btn-send"
                disabled={loading || !inputValue.trim()}
                title="Send Message"
              >
                <Send size={14} />
              </button>
            </form>

            <div className="copilot-input-hint">
              <span>DRISHTI AI Assistant</span>
              <span className="copilot-kbd">Ctrl+K</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
