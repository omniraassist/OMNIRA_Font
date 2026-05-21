import { LegalLayout } from './LegalLayout.jsx';
import { getPublicSiteOrigin } from '../constants/publicSite.js';

export function PrivacyPage() {
  const origin = getPublicSiteOrigin() || 'https://omnira-saas-application.vercel.app';

  return (
    <LegalLayout
      variant="privacy"
      titleBefore="Política de"
      titleAccent="privacidad"
      meta="Última actualización: 9 de mayo de 2026 · Vigente desde su publicación"
    >
      <div className="legal-section">
        <p>
          Omnira («nosotros», «nuestro» o «la plataforma») se compromete a proteger la privacidad de las personas que
          utilizan nuestros servicios. Esta Política de privacidad explica cómo recopilamos, usamos, divulgamos y
          protegemos la información cuando utilizas Omnira, una herramienta que automatiza comunicaciones por WhatsApp y
          la gestión de citas para negocios.
        </p>
      </div>

      <div className="legal-section">
        <h2>Información que recopilamos</h2>
        <p>Podemos tratar los siguientes tipos de información:</p>
        <ul>
          <li>Datos de cuenta: nombre, correo electrónico, teléfono y datos del negocio.</li>
          <li>
            Datos de WhatsApp Business: mensajes enviados y recibidos a través de la integración (procesados según la
            finalidad del servicio; conservación acotada a lo necesario para operar la plataforma).
          </li>
          <li>Datos de uso: interacción con la plataforma, funciones utilizadas e información de sesión.</li>
          <li>
            Datos de pago: tratados de forma segura por proveedores de pago (por ejemplo, Stripe); no almacenamos el
            número completo de tarjeta en nuestros servidores.
          </li>
          <li>Datos técnicos: dirección IP, tipo de navegador y sistema operativo, entre otros similares.</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>Finalidades del tratamiento</h2>
        <ul>
          <li>Prestar, mantener y mejorar el servicio.</li>
          <li>Automatizar respuestas por WhatsApp y la gestión de reservas en tu nombre, según tu configuración.</li>
          <li>Enviar comunicaciones relacionadas con el servicio, facturación o seguridad de la cuenta.</li>
          <li>Gestionar pagos y suscripciones.</li>
          <li>Cumplir obligaciones legales aplicables.</li>
          <li>Atender solicitudes de soporte o consultas.</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>WhatsApp y Meta</h2>
        <p>
          Omnira se integra con la API de WhatsApp Business de Meta Platforms, Inc. Al usar la integración, reconoces
          que parte del flujo de mensajes puede transitar por la infraestructura de Meta. Tratamos esos datos únicamente
          para prestar la automatización contratada y no vendemos tus datos personales a terceros para su marketing
          independiente.
        </p>
        <div className="legal-highlight">
          En relación con los datos de tus clientes finales, actuamos como encargado del tratamiento según las
          instrucciones y la configuración que definas como responsable del negocio, sin perjuicio de las obligaciones
          que correspondan a Meta como proveedor de la API.
        </div>
      </div>

      <div className="legal-section">
        <h2>Cesiones y encargados</h2>
        <p>No vendemos tus datos personales. Podemos recurrir a proveedores que nos ayudan a operar el servicio, entre otros:</p>
        <ul>
          <li>Meta Platforms, Inc. — funcionalidad de WhatsApp Business API.</li>
          <li>Procesadores de pago — cobro y gestión de suscripciones.</li>
          <li>Proveedores de alojamiento, bases de datos y analítica acotada al funcionamiento del producto.</li>
          <li>Autoridades públicas — cuando exista obligación legal.</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>Conservación</h2>
        <p>
          Conservamos los datos mientras mantengas la cuenta activa o sea necesario para prestar el servicio y las
          obligaciones legales. Puedes solicitar la supresión de tus datos personales contactándonos, salvo que debamos
          conservar cierta información por imperativo legal.
        </p>
      </div>

      <div className="legal-section">
        <h2>Tus derechos</h2>
        <p>Según tu residencia y la normativa aplicable (incluido el RGPD en la UE), puedes tener derecho a:</p>
        <ul>
          <li>Acceder a tus datos personales.</li>
          <li>Solicitar rectificación o supresión.</li>
          <li>Oponerte o limitar ciertos tratamientos.</li>
          <li>Solicitar portabilidad cuando proceda.</li>
          <li>Retirar el consentimiento cuando el tratamiento se base en él.</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>Seguridad</h2>
        <p>
          Aplicamos medidas técnicas y organizativas razonables (como cifrado en tránsito mediante TLS, controles de
          acceso y revisiones periódicas). Ningún sistema es absolutamente invulnerable; te recomendamos usar contraseñas
          robustas y proteger el acceso a tu cuenta.
        </p>
      </div>

      <div className="legal-section">
        <h2>Menores</h2>
        <p>
          Omnira no está dirigido a menores de 16 años. No recopilamos a sabiendas datos de menores. Si detectas que un
          menor nos ha facilitado datos, escríbenos para adoptar las medidas oportunas.
        </p>
      </div>

      <div className="legal-section">
        <h2>Cambios en esta política</h2>
        <p>
          Podremos actualizar esta Política de privacidad. Los cambios relevantes se comunicarán por correo electrónico
          o mediante un aviso destacado en la plataforma. El uso continuado del servicio tras la entrada en vigor de los
          cambios implica que has tomado conocimiento de la versión actualizada.
        </p>
      </div>

      <div className="legal-section">
        <h2>Enlaces</h2>
        <p>
          Consulta también los <a href="/terminos">Términos de uso</a> de Omnira.
        </p>
      </div>

      <div className="legal-section">
        <h2>Contacto</h2>
        <p>Para ejercer derechos o resolver dudas sobre privacidad:</p>
        <div className="legal-contact">
          <p>
            <strong>Omnira</strong>
          </p>
          <p>
            Correo: <a href="mailto:ayuda@omnira.chat">ayuda@omnira.chat</a>
          </p>
          <p>
            Sitio web:{' '}
            <a href={origin || '/'}>{origin.replace(/^https?:\/\//, '') || 'omnira'}</a>
          </p>
        </div>
      </div>
    </LegalLayout>
  );
}
