import LegalLayout from "./LegalLayout";

export default function Terminos() {
  return (
    <LegalLayout title="Términos y Condiciones" updatedAt="27 de abril de 2026">
      <h2>1. Descripción del servicio</h2>
      <p>
        GanaderOS (en adelante, "el Servicio") es una plataforma SaaS que permite a ganaderos,
        autónomos y pequeñas empresas agroganaderas en España gestionar su explotación a través de:
      </p>
      <ul>
        <li>Registro de explotaciones, fincas, parcelas, lotes y animales.</li>
        <li>Registro de eventos del ganado: partos, tratamientos, vacunas, pesajes, movimientos e incidencias.</li>
        <li>Control de gastos e ingresos y archivo digital de documentos (guías, recetas, certificados y facturas).</li>
        <li>Generación de facturas en PDF conforme a la normativa española (RD 1619/2012) y envío por email.</li>
        <li>Interacción con el sistema a través de WhatsApp (API oficial de Meta) y lectura automática de documentos.</li>
        <li>Procesamiento de pagos de la suscripción mediante Stripe.</li>
      </ul>

      <h2>2. Aceptación de los términos</h2>
      <p>
        El uso del Servicio implica la aceptación plena y sin reservas de los presentes Términos
        y Condiciones. Si no estás de acuerdo con alguno de ellos, debes abstenerte de utilizar el Servicio.
      </p>

      <h2>3. Responsabilidad del usuario sobre los datos</h2>
      <p className="rounded-md border-l-4 border-primary bg-primary/5 p-4 font-medium">
        El usuario es responsable de la veracidad de los datos introducidos en las facturas y del
        cumplimiento de la normativa fiscal aplicable.
      </p>
      <p>
        GanaderOS actúa únicamente como herramienta tecnológica de apoyo. La validez fiscal,
        contable y legal de los documentos generados depende exclusivamente de la veracidad y
        exactitud de los datos aportados por el usuario, así como del cumplimiento de sus obligaciones
        fiscales (IVA, IRPF, modelo 303, 130, 390, 347, etc.) ante la Agencia Tributaria.
      </p>

      <h2>4. Limitación de responsabilidad</h2>
      <p>
        GanaderOS no será responsable de:
      </p>
      <ul>
        <li>Sanciones, recargos o intereses derivados de declaraciones fiscales incorrectas.</li>
        <li>Errores en facturas causados por datos incorrectos introducidos por el usuario.</li>
        <li>Pérdidas económicas derivadas de la interrupción temporal del Servicio.</li>
        <li>Fallos en servicios de terceros (Stripe, Meta/WhatsApp, proveedores de email u OCR).</li>
        <li>Uso indebido del Servicio por parte del usuario o terceros.</li>
      </ul>
      <p>
        Los cálculos mostrados (IVA, IRPF, totales trimestrales) son orientativos. La presentación
        fiscal corresponde al usuario o a su gestoría.
      </p>

      <h2>5. Condiciones de uso</h2>
      <ul>
        <li>El usuario debe ser mayor de edad y tener capacidad legal para contratar.</li>
        <li>Está prohibido usar el Servicio para fines ilícitos, fraudulentos o que vulneren derechos de terceros.</li>
        <li>Está prohibido emitir facturas falsas, simuladas o por operaciones inexistentes.</li>
        <li>El usuario se compromete a mantener la confidencialidad de sus credenciales de acceso.</li>
        <li>Nos reservamos el derecho a suspender cuentas que incumplan estas condiciones.</li>
      </ul>

      <h2>6. Condiciones de pago</h2>
      <p>
        Las suscripciones al Servicio se gestionan mediante <strong>Stripe</strong>, proveedor de pagos
        certificado PCI-DSS. Los precios se muestran en euros e incluyen el IVA aplicable.
      </p>
      <ul>
        <li>El cobro se realiza de forma recurrente (mensual o anual) según el plan contratado.</li>
        <li>El usuario autoriza el cargo automático en su método de pago.</li>
        <li>En caso de impago, el Servicio podrá suspenderse hasta regularizar la situación.</li>
        <li>Los datos bancarios se procesan exclusivamente por Stripe; GanaderOS no los almacena.</li>
      </ul>

      <h2>7. Cancelaciones y reembolsos</h2>
      <ul>
        <li>El usuario puede cancelar su suscripción en cualquier momento desde su panel de cliente Stripe.</li>
        <li>La cancelación surte efecto al final del periodo de facturación en curso.</li>
        <li>
          Conforme al art. 103.m) del TRLGDCU, al tratarse de contenido digital suministrado de
          forma inmediata, no se aplica el derecho de desistimiento una vez iniciada la prestación
          del servicio con consentimiento expreso del usuario.
        </li>
        <li>
          No se realizan reembolsos por periodos parciales ya facturados, salvo error técnico
          imputable al Servicio o cuando lo exija la legislación vigente.
        </li>
      </ul>

      <h2>8. Propiedad intelectual</h2>
      <p>
        Todos los derechos sobre el software, marca, diseño y contenidos del Servicio pertenecen a
        GanaderOS o a sus licenciantes. El usuario conserva la titularidad de los datos y
        documentos que introduce.
      </p>

      <h2>9. Modificaciones</h2>
      <p>
        Nos reservamos el derecho a modificar estos Términos en cualquier momento. Los cambios se
        comunicarán al usuario por email o desde la propia aplicación con una antelación razonable.
      </p>

      <h2>10. Legislación aplicable y jurisdicción</h2>
      <p>
        Los presentes Términos se rigen por la <strong>legislación española</strong>. Para cualquier
        controversia derivada del uso del Servicio, las partes se someten, con renuncia expresa a
        cualquier otro fuero, a los <strong>Juzgados y Tribunales del domicilio del usuario</strong>
        cuando éste actúe como consumidor, o a los <strong>Juzgados y Tribunales de la ciudad del
        titular del Servicio</strong> en el resto de los casos.
      </p>
      <p>
        Los consumidores tienen acceso a la plataforma de resolución de litigios en línea de la UE:{" "}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
          https://ec.europa.eu/consumers/odr
        </a>
      </p>
    </LegalLayout>
  );
}