import { CountUp } from '../CountUp.jsx';

export function ProblemSection() {
  return (
    <section id="problema" className="section-light">
      <div className="problema-orb" />
      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        <div className="section-header reveal">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> El problema real
          </div>
          <h2>
            Cada mensaje sin respuesta
            <br />
            <span style={{ color: 'var(--muted)' }}>es una cita perdida</span>
          </h2>
          <p>
            Los negocios de salud y bienestar pierden hasta un{' '}
            <strong>30% de sus clientes potenciales</strong> por no responder a tiempo en
            WhatsApp.
          </p>
        </div>

        <div className="pain-grid">
          <div className="glass pain-card reveal reveal-d1" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="pain-icon"><i className="fa-solid fa-comment-slash" style={{ color: 'var(--red)' }} /></div>
            <div>
              <h3>Clientes sin respuesta</h3>
              <p>Cuando estás con un paciente, los mensajes se acumulan. El cliente espera… y reserva en otro sitio.</p>
            </div>
          </div>
          <div className="glass pain-card reveal reveal-d2" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="pain-icon"><i className="fa-solid fa-moon" style={{ color: 'var(--red)' }} /></div>
            <div>
              <h3>Fuera del horario, fuera del negocio</h3>
              <p>
                El 40% de las consultas llegan por la noche o el fin de semana. Sin respuesta inmediata, pierdes esa
                cita.
              </p>
            </div>
          </div>
          <div className="glass pain-card reveal reveal-d3" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="pain-icon"><i className="fa-solid fa-arrows-rotate" style={{ color: 'var(--red)' }} /></div>
            <div>
              <h3>Tiempo perdido en lo repetitivo</h3>
              <p>
                Responder siempre lo mismo — horarios, precios, disponibilidad — te roba horas que deberías dedicar a
                tus clientes.
              </p>
            </div>
          </div>
          <div className="glass pain-card reveal reveal-d4" style={{ borderRadius: 'var(--r-xl)' }}>
            <div className="pain-icon"><i className="fa-solid fa-arrow-trend-down" style={{ color: 'var(--red)' }} /></div>
            <div>
              <h3>Agenda con huecos evitables</h3>
              <p>Sin un sistema ágil, los clientes desisten. Cada minuto de espera reduce la probabilidad de que reserven.</p>
            </div>
          </div>
        </div>

        <div className="stats-bare reveal">
          <div className="stat-col">
            <div className="stat-num"><CountUp target={67} suffix="%" /></div>
            <div className="stat-label">de usuarios esperan respuesta en menos de 1 hora</div>
          </div>
          <div className="stat-col">
            <div className="stat-num"><CountUp target={3} suffix="×" /></div>
            <div className="stat-label">más conversiones con respuesta inmediata</div>
          </div>
          <div className="stat-col">
            <div className="stat-num"><CountUp target={40} suffix="%" /></div>
            <div className="stat-label">de reservas llegan fuera del horario comercial</div>
          </div>
          <div className="stat-col">
            <div className="stat-num"><CountUp target={8} suffix="h" /></div>
            <div className="stat-label">al mes perdidas en gestión administrativa</div>
          </div>
        </div>
      </div>
    </section>
  );
}
