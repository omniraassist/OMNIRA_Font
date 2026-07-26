import { useState, useEffect, useRef, useCallback } from 'react';

const SCENARIOS = [
  {
    id: 'reserva',
    label: 'Reservar cita',
    icon: 'fa-solid fa-calendar-plus',
    messages: [
      { from: 'user', text: 'Hola, quiero reservar una cita para mañana' },
      { from: 'bot', text: '¡Hola! 😊 Soy el asistente de *Centro Ejemplo*. Con mucho gusto te ayudo.\n\n¿Para qué servicio quieres la cita?' },
      { from: 'user', text: 'Para un corte de pelo' },
      { from: 'bot', text: 'Perfecto 👌 Mañana tenemos estos huecos disponibles:\n\n• *10:00* ✅\n• *12:30* ✅\n• *17:00* ✅\n\n¿Cuál prefieres?' },
      { from: 'user', text: 'El de las 12:30' },
      { from: 'bot', text: '¡Reserva confirmada! ✅\n\n📋 *Corte de pelo*\n📅 Mañana\n⏰ 12:30h\n\nRecibirás un recordatorio la noche anterior. ¡Hasta mañana! 👋' },
    ],
  },
  {
    id: 'precios',
    label: 'Consultar precios',
    icon: 'fa-solid fa-tag',
    messages: [
      { from: 'user', text: '¿Cuánto cuesta una limpieza facial?' },
      { from: 'bot', text: '¡Claro! Estos son nuestros tratamientos:\n\n💆 *Limpieza básica* — 35€\n✨ *Limpieza premium* — 55€\n🌟 *Anti-edad* — 75€\n\n¿Te reservo alguno? 😊' },
      { from: 'user', text: 'Sí, la premium por favor' },
      { from: 'bot', text: 'Genial 🌟 La *limpieza premium* incluye vapor de ozono, extracción profunda y mascarilla hidratante.\n\n¿Qué día te viene bien para reservar?' },
      { from: 'user', text: 'El jueves por la tarde' },
      { from: 'bot', text: 'El jueves tenemos las *16:00* y las *18:00* disponibles.\n\n¿Cuál prefieres?' },
    ],
  },
  {
    id: 'horario',
    label: 'Ver horarios',
    icon: 'fa-solid fa-clock',
    messages: [
      { from: 'user', text: '¿A qué hora abréis los sábados?' },
      { from: 'bot', text: '¡Hola! 👋 Nuestros horarios son:\n\n📅 *Lun–Vie:* 9:00 – 20:00\n📅 *Sábados:* 9:00 – 14:00\n📅 *Domingos:* Cerrado\n\n¿Quieres reservar para el sábado?' },
      { from: 'user', text: 'Sí, ¿hay hueco a las 11?' },
      { from: 'bot', text: '¡Perfecto! El sábado a las *11:00* está libre.\n\n¿Para qué servicio lo reservo? 😊' },
    ],
  },
  {
    id: 'cancelar',
    label: 'Cancelar cita',
    icon: 'fa-solid fa-calendar-xmark',
    messages: [
      { from: 'user', text: 'Necesito cancelar mi cita de mañana' },
      { from: 'bot', text: 'Entendido 🙏 He encontrado tu próxima cita:\n\n📋 *Corte y color*\n📅 Mañana a las 16:00h\n\n¿Confirmas la cancelación?' },
      { from: 'user', text: 'Sí, cancélala' },
      { from: 'bot', text: '✅ Cita cancelada correctamente.\n\nCuando quieras volver a reservar escríbeme y busco un hueco. ¡Hasta pronto! 😊' },
    ],
  },
];

function formatText(text) {
  return text.split('\n').map((line, lineIdx, lines) => {
    const parts = line.split(/(\*[^*]+\*)/);
    return (
      <span key={lineIdx}>
        {parts.map((part, j) =>
          /^\*[^*]+\*$/.test(part) ? <strong key={j}>{part.slice(1, -1)}</strong> : part
        )}
        {lineIdx < lines.length - 1 && <br />}
      </span>
    );
  });
}

export function WhatsappSimulatorSection() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [displayed, setDisplayed] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesRef = useRef(null);
  const timeoutsRef = useRef([]);

  const clearTOs = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  };

  const play = useCallback((idx) => {
    clearTOs();
    setDisplayed([]);
    setIsTyping(false);
    const msgs = SCENARIOS[idx].messages;
    let delay = 800;
    msgs.forEach((msg) => {
      if (msg.from === 'user') {
        timeoutsRef.current.push(
          setTimeout(() => setDisplayed((prev) => [...prev, msg]), delay)
        );
        delay += 700;
      } else {
        timeoutsRef.current.push(setTimeout(() => setIsTyping(true), delay));
        delay += 1500;
        timeoutsRef.current.push(
          setTimeout(() => {
            setIsTyping(false);
            setDisplayed((prev) => [...prev, msg]);
          }, delay)
        );
        delay += 900;
      }
    });
  }, []);

  useEffect(() => {
    play(activeIdx);
    return clearTOs;
  }, [activeIdx, play]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [displayed, isTyping]);

  const now = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  return (
    <section id="simulador" className="section" style={{ background: 'var(--ink2)', overflow: 'hidden' }}>
      <div className="container">
        <div className="section-header reveal">
          <div className="eyebrow">DEMO INTERACTIVA</div>
          <h2>
            Pruébalo <span className="gradient-text">sin registro</span>
          </h2>
          <p>
            Así responde Omnira a tus clientes. Elige un escenario y observa la conversación en tiempo real.
          </p>
        </div>

        <div className="sim-layout">
          {/* Left: scenario selector */}
          <div className="sim-scenarios reveal-left">
            <p className="sim-scenarios-label">Elige una situación:</p>
            <div className="sim-scenario-list">
              {SCENARIOS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setActiveIdx(i)}
                  className={`sim-scenario-btn${activeIdx === i ? ' active' : ''}`}
                >
                  <div className="sim-scenario-icon-wrap">
                    <i className={s.icon} />
                  </div>
                  <span>{s.label}</span>
                  {activeIdx === i && (
                    <i className="fa-solid fa-chevron-right sim-scenario-arrow" />
                  )}
                </button>
              ))}
            </div>

            <div className="sim-disclaimer glass">
              <i className="fa-solid fa-circle-info" style={{ color: 'var(--em)', flexShrink: 0, marginTop: '2px' }} />
              <span>
                Demo de ejemplo. El bot real usa los servicios, precios y horarios de <strong>tu negocio</strong>.
              </span>
            </div>

            <a href="#precios" className="btn-primary" style={{ marginTop: '8px', textAlign: 'center', display: 'block' }}>
              Activar mi bot <i className="fa-solid fa-arrow-right" />
            </a>
          </div>

          {/* Right: phone mockup */}
          <div className="sim-phone-wrap reveal-right">
            <div className="sim-phone">
              {/* Status bar */}
              <div className="wa-status-bar">
                <span>{now}</span>
                <div className="wa-status-icons">
                  <i className="fa-solid fa-signal" />
                  <i className="fa-solid fa-wifi" />
                  <i className="fa-solid fa-battery-three-quarters" />
                </div>
              </div>

              {/* WA Header */}
              <div className="wa-header">
                <div className="wa-header-left">
                  <i className="fa-solid fa-arrow-left" style={{ color: '#00EDAA', fontSize: '14px' }} />
                  <div className="wa-avatar">O</div>
                  <div className="wa-info">
                    <div className="wa-name">Omnira Bot</div>
                    <div className="wa-online">{isTyping ? 'escribiendo…' : 'en línea'}</div>
                  </div>
                </div>
                <div className="wa-header-icons">
                  <i className="fa-solid fa-video" />
                  <i className="fa-solid fa-phone" />
                  <i className="fa-solid fa-ellipsis-vertical" />
                </div>
              </div>

              {/* Messages */}
              <div className="wa-messages" ref={messagesRef}>
                <div className="wa-date-chip">Hoy</div>

                {displayed.map((msg, i) => (
                  <div key={i} className={`wa-msg-wrap ${msg.from}`}>
                    <div className={`wa-bubble ${msg.from}`}>
                      <span className="wa-bubble-text">{formatText(msg.text)}</span>
                      <span className="wa-time">
                        {now}
                        {msg.from === 'user' && (
                          <i
                            className="fa-solid fa-check-double"
                            style={{ marginLeft: '3px', color: '#53bdeb' }}
                          />
                        )}
                      </span>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="wa-msg-wrap bot">
                    <div className="wa-bubble bot wa-typing-bubble">
                      <span className="wa-typing-dots">
                        <span /><span /><span />
                      </span>
                    </div>
                  </div>
                )}

              </div>

              {/* Input bar */}
              <div className="wa-input-bar">
                <div className="wa-input-field">
                  <i className="fa-regular fa-face-smile" style={{ fontSize: '18px', flexShrink: 0 }} />
                  <span style={{ fontSize: '12.5px', color: '#8696A0' }}>Escribe un mensaje</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#8696A0' }}>
                  <i className="fa-solid fa-paperclip" style={{ fontSize: '18px' }} />
                  <div className="wa-mic-btn">
                    <i className="fa-solid fa-microphone" style={{ fontSize: '15px' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Replay hint */}
            <button
              onClick={() => play(activeIdx)}
              className="sim-replay-btn"
            >
              <i className="fa-solid fa-rotate-right" /> Repetir conversación
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
