import LegalLayout from "./LegalLayout";

export default function Privacidad() {
  return (
    <LegalLayout title="Política de Privacidad" updatedAt="27 de abril de 2026">
      <p>
        En cumplimiento del Reglamento (UE) 2016/679 (RGPD) y de la Ley Orgánica 3/2018 de Protección
        de Datos Personales y garantía de los derechos digitales (LOPDGDD), informamos a los usuarios
        del tratamiento de sus datos personales.
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <ul>
        <li><strong>Titular:</strong> Diego Serrano Retamosa</li>
        <li><strong>NIF:</strong> 76046662Z</li>
        <li><strong>Domicilio:</strong> C/ Paseo de Extremadura, Herguijuela (Cáceres), España</li>
        <li><strong>Email de contacto:</strong> contacto@papeleofacil.com</li>
      </ul>

      <h2>2. Datos que recogemos</h2>
      <h3>Datos del usuario titular de la cuenta</h3>
      <ul>
        <li>Nombre, email, teléfono.</li>
        <li>Datos fiscales: NIF/CIF, razón social, dirección fiscal.</li>
        <li>Datos de la empresa: serie de facturación, IVA/IRPF por defecto.</li>
        <li>Número de WhatsApp (para vincular la cuenta al bot).</li>
        <li>Datos de pago gestionados por Stripe (no almacenamos números de tarjeta).</li>
        <li>Datos técnicos: dirección IP, navegador, logs de acceso.</li>
      </ul>
      <h3>Datos de clientes del usuario (a efectos de facturación)</h3>
      <ul>
        <li>Nombre o razón social, NIF/CIF.</li>
        <li>Dirección fiscal, código postal, ciudad, provincia.</li>
        <li>Email y teléfono de contacto.</li>
        <li>Histórico de facturas y cobros emitidos.</li>
      </ul>
      <p>
        Respecto a los datos de los clientes finales, el usuario actúa como <strong>responsable del
        tratamiento</strong> y GanaderOS como <strong>encargado del tratamiento</strong>, conforme
        al art. 28 del RGPD.
      </p>

      <h2>3. Finalidad del tratamiento</h2>
      <ul>
        <li>Prestar el servicio de generación, envío y gestión de facturas.</li>
        <li>Gestionar la relación contractual y la facturación de la suscripción.</li>
        <li>Procesar pagos a través de Stripe.</li>
        <li>Permitir la interacción con el usuario vía WhatsApp (API de Meta).</li>
        <li>Procesar imágenes de tickets mediante OCR para registrar gastos.</li>
        <li>Enviar comunicaciones técnicas o relacionadas con el servicio.</li>
        <li>Cumplir con obligaciones legales (conservación de facturas, etc.).</li>
        <li>Enviar comunicaciones comerciales sobre el servicio (solo con consentimiento).</li>
      </ul>

      <h2>4. Base legal del tratamiento</h2>
      <ul>
        <li><strong>Ejecución del contrato</strong> (art. 6.1.b RGPD): para prestar el servicio contratado.</li>
        <li><strong>Cumplimiento de obligación legal</strong> (art. 6.1.c RGPD): conservación contable y fiscal.</li>
        <li><strong>Consentimiento</strong> (art. 6.1.a RGPD): comunicaciones comerciales y cookies no esenciales.</li>
        <li><strong>Interés legítimo</strong> (art. 6.1.f RGPD): seguridad, prevención de fraude, mejora del servicio.</li>
      </ul>

      <h2>5. Cesión de datos a terceros</h2>
      <p>
        No cedemos datos a terceros salvo obligación legal o cuando sea estrictamente necesario para
        prestar el servicio. Utilizamos los siguientes encargados del tratamiento:
      </p>
      <ul>
        <li>
          <strong>Stripe Payments Europe, Ltd.</strong> (Irlanda) — procesamiento de pagos.{" "}
          <a href="https://stripe.com/es/privacy" target="_blank" rel="noopener noreferrer">Política de privacidad</a>.
        </li>
        <li>
          <strong>Meta Platforms Ireland Ltd.</strong> — WhatsApp Business API para mensajería.{" "}
          <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer">Política de WhatsApp Business</a>.
        </li>
        <li>
          <strong>Supabase / proveedor cloud</strong> — alojamiento, base de datos y almacenamiento (servidores en la UE).
        </li>
        <li>
          <strong>Proveedores de IA (OCR/asistente)</strong> — para la lectura de tickets y procesamiento de mensajes (datos minimizados, sin uso para entrenamiento).
        </li>
        <li>
          <strong>Proveedor de email transaccional</strong> — para envío de facturas y notificaciones.
        </li>
      </ul>
      <p>
        Algunos proveedores pueden realizar transferencias internacionales fuera del EEE; en tales
        casos se aplican Cláusulas Contractuales Tipo aprobadas por la Comisión Europea.
      </p>

      <h2>6. Tiempo de conservación</h2>
      <ul>
        <li>Datos de cuenta: mientras el usuario mantenga su suscripción activa.</li>
        <li>Datos fiscales y facturas: <strong>mínimo 6 años</strong> (art. 30 Código de Comercio) y hasta <strong>4 años</strong> a efectos tributarios (art. 66 LGT).</li>
        <li>Datos de cobros y pagos: durante el plazo legalmente exigido.</li>
        <li>Tras la baja, los datos se bloquean a disposición de las administraciones competentes durante los plazos legales y posteriormente se suprimen.</li>
      </ul>

      <h2>7. Derechos del usuario</h2>
      <p>Puedes ejercer los siguientes derechos enviando un email al responsable del tratamiento:</p>
      <ul>
        <li><strong>Acceso</strong> a tus datos personales.</li>
        <li><strong>Rectificación</strong> de datos inexactos.</li>
        <li><strong>Supresión</strong> ("derecho al olvido") cuando ya no sean necesarios.</li>
        <li><strong>Limitación</strong> del tratamiento.</li>
        <li><strong>Portabilidad</strong> de los datos en formato estructurado.</li>
        <li><strong>Oposición</strong> al tratamiento basado en interés legítimo.</li>
        <li><strong>Retirada del consentimiento</strong> en cualquier momento.</li>
        <li>
          Reclamación ante la <strong>Agencia Española de Protección de Datos</strong> (
          <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">www.aepd.es</a>
          ) si consideras que el tratamiento no se ajusta a la normativa.
        </li>
      </ul>

      <h2>8. Medidas de seguridad</h2>
      <p>Aplicamos medidas técnicas y organizativas adecuadas, entre otras:</p>
      <ul>
        <li>Cifrado en tránsito (HTTPS/TLS) y en reposo de bases de datos.</li>
        <li>Autenticación segura y control de acceso por roles.</li>
        <li>Row-Level Security (RLS) a nivel de base de datos: cada usuario solo accede a sus datos.</li>
        <li>Copias de seguridad periódicas y monitorización de incidentes.</li>
        <li>Servidores ubicados en la Unión Europea.</li>
        <li>Acceso restringido del personal bajo deber de confidencialidad.</li>
      </ul>
      <p>
        En caso de brecha de seguridad que afecte a tus datos, te lo notificaremos en un plazo
        máximo de 72 horas, conforme al art. 33 RGPD.
      </p>
    </LegalLayout>
  );
}