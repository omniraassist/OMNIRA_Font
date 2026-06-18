import { useState } from 'react';

const FAQS = [
  {
    q: '¿Necesito saber programar para usar Omnira?',
    a: 'No, en absoluto. Omnira está diseñado para que cualquier negocio pueda activarlo sin ningún conocimiento técnico. Al completar el pago, el sistema asigna tu número de WhatsApp y activa el bot de forma automática — sin pasos manuales ni configuraciones complicadas.',
  },
  {
    q: '¿Cómo obtengo mi número de WhatsApp?',
    a: 'En el momento en que se confirma tu pago, Omnira te asigna automáticamente un número de WhatsApp Business exclusivo para tu negocio. No necesitas crear ninguna cuenta en Twilio ni en Meta: nosotros gestionamos toda la infraestructura por ti. El número aparece en tu dashboard en menos de 60 segundos y ya está listo para recibir mensajes de tus clientes.',
  },
  {
    q: '¿Tengo que pagar el número de WhatsApp por separado?',
    a: 'No. El número de WhatsApp Business y todos los costes de mensajería están incluidos en tu plan de Omnira. Cada plan incluye una cuota mensual de conversaciones únicas: 300 con el plan mensual, 500 con el trimestral, 1.000 con el semestral y 2.000 con el anual. OMNIRA absorbe el coste de Twilio — tú solo pagas tu suscripción.',
  },
  {
    q: '¿Puedo cancelar en cualquier momento?',
    a: 'Con el plan mensual, sí, puedes cancelar cuando quieras sin penalización. Los planes multimensuales son pagos únicos por el período contratado. Además, todos los planes incluyen 14 días de garantía de devolución.',
  },
  {
    q: '¿El bot responde fuera de mi horario también?',
    a: 'Sí, el bot funciona 24 horas al día, 7 días a la semana. Puede responder a cualquier hora e incluso puede configurarse para indicar que las reservas son para días laborables mientras confirma el interés del cliente.',
  },
  {
    q: '¿Qué pasa si tengo dudas durante la configuración?',
    a: 'Nuestro equipo de soporte en español está disponible para ayudarte en cualquier momento. Todos los planes incluyen soporte, y los planes premium cuentan con soporte prioritario VIP con respuesta garantizada en menos de 2 horas.',
  },
];

export function FaqSection() {
  const [open, setOpen] = useState(null);
  return (
    <section className="section" style={{ background: 'var(--ink2)' }}>
      <div className="container">
        <div className="section-header reveal">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> Preguntas frecuentes
          </div>
          <h2>Resolvemos tus dudas</h2>
        </div>
        <div style={{ maxWidth: '740px', margin: '0 auto' }} className="reveal">
          {FAQS.map((item, i) => (
            <div
              key={item.q}
              className="faq-item glass"
              style={{ borderRadius: 'var(--r-lg)', padding: '24px 28px', marginBottom: i < FAQS.length - 1 ? '12px' : 0, cursor: 'pointer' }}
              onClick={() => setOpen(open === i ? null : i)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setOpen(open === i ? null : i)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', fontFamily: "'Outfit',sans-serif" }}>{item.q}</h3>
                <i
                  className="fa-solid fa-plus faq-icon"
                  style={{
                    color: 'var(--em)',
                    fontSize: '14px',
                    flexShrink: 0,
                    transition: 'transform 0.3s',
                    transform: open === i ? 'rotate(45deg)' : 'rotate(0deg)',
                  }}
                />
              </div>
              <div className="faq-answer" style={{ display: open === i ? 'block' : 'none', marginTop: '14px' }}>
                <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.75 }}>{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
