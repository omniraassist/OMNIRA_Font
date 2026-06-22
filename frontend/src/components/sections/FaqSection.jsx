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
  return (
    <section className="section" style={{ background: 'var(--ink2)' }}>
      <div className="container">
        <div className="section-header reveal">
          <h2>Resolvemos tus dudas</h2>
        </div>
        <div className="faq-grid reveal">
          {FAQS.map((item) => (
            <div key={item.q} className="faq-grid-item">
              <div className="faq-grid-q">
                <span className="faq-grid-icon">
                  <i className="fa-solid fa-circle-question" />
                </span>
                <h3>{item.q}</h3>
              </div>
              <p className="faq-grid-a">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
