import LegalLayout from "./LegalLayout";

export default function AvisoLegal() {
  return (
    <LegalLayout title="Aviso Legal" updatedAt="27 de abril de 2026">
      <p>
        En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la
        Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se ponen a disposición de
        los usuarios los siguientes datos identificativos del titular del sitio web.
      </p>

      <h2>1. Datos identificativos del titular</h2>
      <ul>
        <li><strong>Titular:</strong> Diego Serrano Retamosa</li>
        <li><strong>NIF:</strong> 76046662Z</li>
        <li><strong>Domicilio:</strong> C/ Paseo de Extremadura, Herguijuela (Cáceres), España</li>
        <li><strong>Email de contacto:</strong> contacto@ganaderoos.com</li>
        <li><strong>Sitio web:</strong> https://ganaderoos.com</li>
        <li><strong>Régimen:</strong> Persona física trabajador autónomo (no inscripción en Registro Mercantil).</li>
      </ul>

      <h2>2. Objeto del sitio web</h2>
      <p>
        El sitio web tiene por objeto presentar y facilitar el acceso al servicio GanaderOS:
        una plataforma SaaS de gestión ganadera para controlar animales, lotes, fincas,
        eventos sanitarios y reproductivos, gastos, ingresos, documentos y tareas de
        explotaciones ganaderas en España.
      </p>

      <h2>3. Condiciones de uso del sitio</h2>
      <ul>
        <li>El acceso al sitio es gratuito, salvo en lo relativo al coste de conexión a Internet.</li>
        <li>El usuario se compromete a hacer un uso adecuado y lícito del sitio, conforme a la legislación, la moral, el orden público y los presentes Términos.</li>
        <li>
          Queda prohibido:
          <ul>
            <li>Realizar actividades ilícitas, ilegales o contrarias a la buena fe.</li>
            <li>Difundir contenidos de carácter racista, xenófobo, pornográfico o que vulneren derechos humanos.</li>
            <li>Provocar daños en los sistemas físicos o lógicos del titular o de terceros.</li>
            <li>Introducir o difundir virus informáticos o cualquier otro sistema susceptible de causar daños.</li>
            <li>Intentar acceder, utilizar o manipular los datos de otros usuarios.</li>
          </ul>
        </li>
        <li>El titular podrá interrumpir el servicio o resolver de inmediato la relación con el usuario en caso de detectar un uso contrario a estas condiciones.</li>
      </ul>

      <h2>4. Propiedad intelectual e industrial</h2>
      <p>
        Todos los contenidos del sitio (textos, imágenes, logotipos, código fuente, diseño,
        bases de datos, etc.) son titularidad del titular o de terceros que han autorizado su uso, y
        están protegidos por la normativa nacional e internacional de propiedad intelectual e
        industrial. Queda prohibida su reproducción, distribución, comunicación pública o
        transformación sin autorización expresa.
      </p>

      <h2>5. Exclusión de garantías y responsabilidad</h2>
      <p>
        El titular no se hace responsable de los daños o perjuicios que pudieran derivarse de:
      </p>
      <ul>
        <li>Interrupciones, virus o desconexiones del sistema operativo o de Internet.</li>
        <li>Retrasos o bloqueos en el uso causados por deficiencias o sobrecargas en las líneas o redes de telecomunicaciones.</li>
        <li>Acciones de terceros que vulneren las medidas de seguridad implantadas.</li>
        <li>Información proporcionada por el usuario que sea inexacta, falsa o desactualizada.</li>
      </ul>

      <h2>6. Enlaces a terceros</h2>
      <p>
        El sitio puede contener enlaces a páginas de terceros. El titular no asume ninguna
        responsabilidad sobre los contenidos, políticas o prácticas de dichos sitios externos.
      </p>

      <h2>7. Protección de datos</h2>
      <p>
        Toda la información sobre tratamiento de datos personales está disponible en nuestra{" "}
        <a href="/privacidad">Política de Privacidad</a>.
      </p>

      <h2>8. Legislación aplicable</h2>
      <p>
        El presente Aviso Legal se rige por la legislación española. Para la resolución de cualquier
        controversia, las partes se someten a la jurisdicción y tribunales competentes según la
        legislación vigente.
      </p>
    </LegalLayout>
  );
}
