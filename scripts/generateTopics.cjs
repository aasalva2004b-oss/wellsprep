// Generator script to produce clean officialTopics.ts from the official syllabus
const fs = require('fs');
const path = require('path');

// We structure the official syllabus topics
const subjectsData = {
  constitucional: {
    id: 'constitucional',
    name: 'Derecho Constitucional y de la Unión Europea',
    shortName: 'Constitucional',
    color: 'bg-red-500',
    activeClass: 'bg-red-100 text-red-700 ring-1 ring-red-500',
    totalTopics: 29,
    topics: [
      {
        number: 1,
        title: "La Constitución Española de 1978: estructura, valores y sistema de fuentes",
        fullTitle: "La Constitución Española de 1978: estructura y caracteres. El Título Preliminar. Los valores superiores y principios constitucionales. La Constitución y el sistema de fuentes. Los tratados internacionales y su posición en el sistema de fuentes. La reforma constitucional."
      },
      {
        number: 2,
        title: "El principio de reserva de ley, decretos legislativos y leyes autonómicas",
        fullTitle: "El principio de reserva de ley. Leyes orgánicas y leyes ordinarias. Disposiciones del Gobierno con fuerza de ley: decretos legislativos y decretos leyes. Los excesos de la delegación y su control. Leyes de las Comunidades Autónomas."
      },
      {
        number: 3,
        title: "Los Estatutos de Autonomía y ordenamientos de las Comunidades Autónomas",
        fullTitle: "Los Estatutos de Autonomía. Los ordenamientos jurídicos de las Comunidades Autónomas. La aplicación del ordenamiento autonómico por los tribunales. Relaciones entre el ordenamiento estatal y los autonómicos: competencia, prevalencia y supletoriedad."
      },
      {
        number: 4,
        title: "El Título I de la Constitución Española y derechos fundamentales",
        fullTitle: "El Título I de la Constitución Española. La dignidad de la persona. Los derechos inherentes a la persona y derechos fundamentales. El singular criterio de interpretación de los derechos fundamentales del artículo 10.2 de la Constitución. Titularidad y ejercicio de los derechos fundamentales. La reserva de ley. Eficacia de los derechos fundamentales, en particular, en las relaciones entre particulares. Límites de los derechos fundamentales."
      },
      {
        number: 5,
        title: "Igualdad, vida, integridad física, libertad ideológica y extranjería",
        fullTitle: "El principio y derecho fundamental a la igualdad y la prohibición de discriminación. El derecho a la vida y a la integridad física y moral. La libertad ideológica, religiosa y de culto. La protección jurídica de los extranjeros en España."
      },
      {
        number: 6,
        title: "Prohibición de discriminación por razón de género y paridad",
        fullTitle: "Bases constitucionales de la prohibición de discriminación por razón de género. Textos e instrumentos auspiciados por Naciones Unidas contra la discriminación por razón de género: en especial la Convención sobre la eliminación de todas las formas de discriminación contra la mujer y el Comité para la eliminación de la discriminación contra la mujer (CEDAW). La interdicción de la discriminación por razón de género en la UE. La legislación española sobre igualdad efectiva entre hombres y mujeres; referencia a la Ley Orgánica 2/2024, de 1 de agosto de representación paritaria y presencia equilibrada de mujeres y hombres."
      },
      {
        number: 7,
        title: "Derecho a la igualdad y lucha contra la violencia de género (LO 1/2004)",
        fullTitle: "Derecho a la igualdad y lucha contra la violencia de género. Las recomendaciones generales 19 y 35 del Comité para la eliminación de la discriminación contra la mujer. El Convenio del Consejo de Europa sobre prevención y lucha contra la violencia contra las mujeres y la violencia de género. La Ley Orgánica 1/2004 de Medidas de Protección Integral contra la Violencia de Género: objeto y principios rectores, medidas de sensibilización, prevención y detección, derechos de las mujeres víctimas de la violencia de género, tutela institucional."
      },
      {
        number: 8,
        title: "Libertad, seguridad, privacidad, honor, domicilio y comunicaciones",
        fullTitle: "El derecho a la libertad y a la seguridad. Los derechos de la privacidad: derecho al honor, a la intimidad personal y familiar y a la propia imagen, la inviolabilidad del domicilio, el secreto de las comunicaciones y la protección de datos. Libertad de circulación y residencia."
      },
      {
        number: 9,
        title: "Libertad de expresión, reunión, asociación, sindicación y educación",
        fullTitle: "Libertad de expresión e información. Derecho de reunión. Derecho de asociación. Derecho de sindicación y libertad sindical. Derecho de huelga. Derecho de participación en los asuntos públicos y derecho de petición. Derecho a la educación y a la libertad de enseñanza."
      },
      {
        number: 10,
        title: "Tutela judicial efectiva (art. 24 CE) y principio de legalidad (art. 25 CE)",
        fullTitle: "Los derechos contenidos en el artículo 24 de la Constitución Española, con especial referencia a la tutela judicial efectiva. El artículo 25 de la Constitución Española, especial referencia al principio de legalidad y a la potestad sancionadora de la Administración."
      },
      {
        number: 11,
        title: "Derechos y deberes de los ciudadanos y principios rectores",
        fullTitle: "Derechos y deberes de los ciudadanos: breve exposición de su contenido. Principios rectores de la política social y económica: breve exposición de su contenido."
      },
      {
        number: 12,
        title: "Garantías de libertades (art. 53 CE), Defensor del Pueblo y suspensión",
        fullTitle: "La protección y garantía de las libertades y de los derechos fundamentales en la Constitución Española. Las garantías normativas; análisis del artículo 53 de la Constitución Española. Las garantías institucionales: el Defensor del Pueblo. La suspensión de los derechos y libertades."
      },
      {
        number: 13,
        title: "El Tribunal Constitucional: organización, competencias y control previo",
        fullTitle: "El Tribunal Constitucional. Composición, organización y competencia. Funciones. El control de constitucionalidad de las leyes: el recurso de inconstitucionalidad y la cuestión de inconstitucionalidad. Alcance de las sentencias del Tribunal Constitucional. El control previo de la constitucionalidad de los tratados internacionales."
      },
      {
        number: 14,
        title: "El recurso de amparo y conflictos constitucionales",
        fullTitle: "El recurso de amparo. Actos sujetos. Legitimación. Procedimiento. La sentencia de amparo. Los conflictos de competencia entre el Estado y las Comunidades Autónomas y de éstas entre sí. Los conflictos de atribuciones entre órganos constitucionales. El conflicto en defensa de la autonomía local."
      },
      {
        number: 15,
        title: "Derechos Humanos: Declaración Universal, ONU, CEDH y TEDH",
        fullTitle: "La Declaración Universal de Derechos Humanos. Otros Tratados de Naciones Unidas en materia de derechos fundamentales. Los mecanismos de garantía de los derechos en la Organización de Naciones Unidas: en especial el Comité de Derechos Humanos. El Convenio Europeo de Derechos Humanos. El Tribunal Europeo de Derechos Humanos: constitución, competencias y procedimiento. La eficacia de las sentencias del Tribunal Europeo de Derechos Humanos: en especial el artículo 5 bis de la LOPJ. Otros tratados e instrumentos de garantía de derechos humanos en el ámbito del Consejo de Europa."
      },
      {
        number: 16,
        title: "Protección de derechos fundamentales en la Unión Europea y Carta DFUE",
        fullTitle: "La protección de los derechos fundamentales en la Unión Europea. El artículo 6 del Tratado de la Unión Europea. La Carta de Derechos Fundamentales de la Unión Europea. Estructura y contenido. Ámbito de aplicación. Alcance e interpretación de los derechos y principios. Nivel de protección. Las explicaciones sobre la Carta de Derechos Fundamentales de la Unión Europea."
      },
      {
        number: 17,
        title: "Estado social y democrático, Monarquía parlamentaria y la Corona",
        fullTitle: "El Estado social y democrático de derecho. La monarquía parlamentaria como forma política del Estado. La Corona. Funciones del Rey. El refrendo de sus actos."
      },
      {
        number: 18,
        title: "El Parlamento: Las Cortes Generales y procedimiento legislativo",
        fullTitle: "El Parlamento: sistemas unicamerales y bicamerales. Las Cortes Generales: composición y estructura. Iniciativa y procedimiento legislativo."
      },
      {
        number: 19,
        title: "El Gobierno: composición, funciones, control político y Administración",
        fullTitle: "El Gobierno. Composición, funciones y estatuto de sus miembros. La función de dirección política. El control político del Gobierno. Gobierno y Administración."
      },
      {
        number: 20,
        title: "Constitución económica, potestad financiera, Presupuestos y Tribunal de Cuentas",
        fullTitle: "La Constitución económica. La potestad financiera. Los presupuestos generales del Estado. Principios constitucionales del derecho tributario. El Tribunal de Cuentas."
      },
      {
        number: 21,
        title: "El Estado autonómico: competencias de las CCAA y autonomía local",
        fullTitle: "El Estado autonómico. Criterios generales relativos a la distribución de competencias entre el Estado y las Comunidades Autónomas. Organización institucional de las Comunidades Autónomas. La autonomía local."
      },
      {
        number: 22,
        title: "Los partidos políticos: régimen, financiación y disolución",
        fullTitle: "Los partidos políticos. Concepto de partido político. Formación. Estatutos. Organización y funcionamiento. Financiación. El control sobre los partidos políticos. Su disolución."
      },
      {
        number: 23,
        title: "El régimen electoral general y administración electoral",
        fullTitle: "El régimen electoral general. Derecho de sufragio activo y pasivo. La administración electoral. El procedimiento electoral. Los recursos en materia electoral. Ordenación de las elecciones locales."
      },
      {
        number: 24,
        title: "El Poder Judicial y Consejo General del Poder Judicial (CGPJ)",
        fullTitle: "El Poder Judicial. La sumisión del juez a la ley y la independencia judicial; la inamovilidad. El Consejo General del Poder Judicial. Estructura y atribuciones."
      },
      {
        number: 25,
        title: "Estatuto de Jueces y Magistrados y gobierno interno de Tribunales",
        fullTitle: "Estatuto de Jueces y Magistrados. Prohibiciones e incompatibilidades. Régimen disciplinario. El gobierno interno de Tribunales."
      },
      {
        number: 26,
        title: "El Ministerio Fiscal: posición constitucional, órganos y funciones",
        fullTitle: "El Ministerio Fiscal. Su posición constitucional. Principios configuradores. La autonomía funcional. Funciones. Órganos del Ministerio Fiscal. El Fiscal General del Estado, el Consejo Fiscal, la Junta de Fiscales de Sala y la Junta de Fiscales Superiores de las Comunidades Autónomas."
      },
      {
        number: 27,
        title: "La Unión Europea: Tratados constitutivos, adhesión e Instituciones",
        fullTitle: "La Unión Europea. Los Tratados constitutivos, sus reformas y la situación tras el Tratado de Lisboa. La adhesión a la Unión. La retirada de la Unión. La suspensión de los derechos del Estado miembro. Los valores en los que se fundamenta la Unión, en especial, el Estado de Derecho. Principios que delimitan las competencias entre la Unión y los Estados miembros y principios que rigen el ejercicio de las competencias. Breve referencia a las Instituciones y órganos de la Unión Europa."
      },
      {
        number: 28,
        title: "Sistema de fuentes de la UE: primacía, efecto directo y responsabilidad",
        fullTitle: "El sistema de fuentes de la Unión Europea y su relación con los ordenamientos nacionales. Derecho originario, derecho derivado, acuerdos internacionales y principios generales del Derecho. La aplicación del Derecho de la Unión Europea por los Estados miembros: efecto directo, primacía e interpretación conforme. Autonomía procedimental y los principios de efectividad y de equivalencia. Las consecuencias del incumplimiento del Derecho de la Unión, en especial, la responsabilidad patrimonial de los Estados miembros."
      },
      {
        number: 29,
        title: "Tribunal de Justicia de la UE, cuestión prejudicial y Fiscalía Europea",
        fullTitle: "El Tribunal de Justicia de la Unión Europea: composición y competencias. El juez español y el derecho de la Unión Europea: articulo 4.bis LOPJ. La cuestión prejudicial ante el Tribunal de Justicia y ante el Tribunal General. Otros procedimientos ante el Tribunal de Justicia. La Fiscalía Europea."
      }
    ]
  }
};

console.log("Generator template ready");
