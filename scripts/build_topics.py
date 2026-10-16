#!/usr/bin/env python3
import json
import re

# Data extracted directly from the official PDF (Temario 2025/2026 Convocatoria de 29 de octubre de 2025)
# Carrera Judicial y Fiscal

raw_data = """
### SUBJECT: constitucional
### NAME: Derecho Constitucional y de la Unión Europea
### COLOR: bg-red-500
### ACTIVE_CLASS: bg-red-100 text-red-700 ring-1 ring-red-500

Tema 1. La Constitución Española de 1978: estructura y caracteres. El Título Preliminar. Los valores superiores y principios constitucionales. La Constitución y el sistema de fuentes. Los tratados internacionales y su posición en el sistema de fuentes. La reforma constitucional.
Tema 2. El principio de reserva de ley. Leyes orgánicas y leyes ordinarias. Disposiciones del Gobierno con fuerza de ley: decretos legislativos y decretos leyes. Los excesos de la delegación y su control. Leyes de las Comunidades Autónomas.
Tema 3. Los Estatutos de Autonomía. Los ordenamientos jurídicos de las Comunidades Autónomas. La aplicación del ordenamiento autonómico por los tribunales. Relaciones entre el ordenamiento estatal y los autonómicos: competencia, prevalencia y supletoriedad.
Tema 4. El Título I de la Constitución Española. La dignidad de la persona. Los derechos inherentes a la persona y derechos fundamentales. El singular criterio de interpretación de los derechos fundamentales del artículo 10.2 de la Constitución. Titularidad y ejercicio de los derechos fundamentales. La reserva de ley. Eficacia de los derechos fundamentales, en particular, en las relaciones entre particulares. Límites de los derechos fundamentales.
Tema 5. El principio y derecho fundamental a la igualdad y la prohibición de discriminación. El derecho a la vida y a la integridad física y moral. La libertad ideológica, religiosa y de culto. La protección jurídica de los extranjeros en España.
Tema 6. Bases constitucionales de la prohibición de discriminación por razón de género. Textos e instrumentos auspiciados por Naciones Unidas contra la discriminación por razón de género: en especial la Convención sobre la eliminación de todas las formas de discriminación contra la mujer y el Comité para la eliminación de la discriminación contra la mujer (CEDAW). La interdicción de la discriminación por razón de género en la UE. La legislación española sobre igualdad efectiva entre hombres y mujeres; referencia a la Ley Orgánica 2/2024, de 1 de agosto de representación paritaria y presencia equilibrada de mujeres y hombres.
Tema 7. Derecho a la igualdad y lucha contra la violencia de género. Las recomendaciones generales 19 y 35 del Comité para la eliminación de la discriminación contra la mujer. El Convenio del Consejo de Europa sobre prevención y lucha contra la violencia contra las mujeres y la violencia de género. La Ley Orgánica 1/2004 de Medidas de Protección Integral contra la Violencia de Género: objeto y principios rectores, medidas de sensibilización, prevención y detección, derechos de las mujeres víctimas de la violencia de género, tutela institucional.
Tema 8. El derecho a la libertad y a la seguridad. Los derechos de la privacidad: derecho al honor, a la intimidad personal y familiar y a la propia imagen, la inviolabilidad del domicilio, el secreto de las comunicaciones y la protección de datos. Libertad de circulación y residencia.
Tema 9. Libertad de expresión e información. Derecho de reunión. Derecho de asociación. Derecho de sindicación y libertad sindical. Derecho de huelga. Derecho de participación en los asuntos públicos y derecho de petición. Derecho a la educación y a la libertad de enseñanza.
Tema 10. Los derechos contenidos en el artículo 24 de la Constitución Española, con especial referencia a la tutela judicial efectiva. El artículo 25 de la Constitución Española, especial referencia al principio de legalidad y a la potestad sancionadora de la Administración.
Tema 11. Derechos y deberes de los ciudadanos: breve exposición de su contenido. Principios rectores de la política social y económica: breve exposición de su contenido.
Tema 12. La protección y garantía de las libertades y de los derechos fundamentales en la Constitución Española. Las garantías normativas; análisis del artículo 53 de la Constitución Española. Las garantías institucionales: el Defensor del Pueblo. La suspensión de los derechos y libertades.
Tema 13. El Tribunal Constitucional. Composición, organización y competencia. Funciones. El control de constitucionalidad de las leyes: el recurso de inconstitucionalidad y la cuestión de inconstitucionalidad. Alcance de las sentencias del Tribunal Constitucional. El control previo de la constitucionalidad de los tratados internacionales.
Tema 14. El recurso de amparo. Actos sujetos. Legitimación. Procedimiento. La sentencia de amparo. Los conflictos de competencia entre el Estado y las Comunidades Autónomas y de éstas entre sí. Los conflictos de atribuciones entre órganos constitucionales. El conflicto en defensa de la autonomía local.
Tema 15. La Declaración Universal de Derechos Humanos. Otros Tratados de Naciones Unidas en materia de derechos fundamentales. Los mecanismos de garantía de los derechos en la Organización de Naciones Unidas: en especial el Comité de Derechos Humanos. El Convenio Europeo de Derechos Humanos. El Tribunal Europeo de Derechos Humanos: constitución, competencias y procedimiento. La eficacia de las sentencias del Tribunal Europeo de Derechos Humanos: en especial el artículo 5 bis de la LOPJ. Otros tratados e instrumentos de garantía de derechos humanos en el ámbito del Consejo de Europa.
Tema 16. La protección de los derechos fundamentales en la Unión Europea. El artículo 6 del Tratado de la Unión Europea. La Carta de Derechos Fundamentales de la Unión Europea. Estructura y contenido. Ámbito de aplicación. Alcance e interpretación de los derechos y principios. Nivel de protección. Las explicaciones sobre la Carta de Derechos Fundamentales de la Unión Europea.
Tema 17. El Estado social y democrático de derecho. La monarquía parlamentaria como forma política del Estado. La Corona. Funciones del Rey. El refrendo de sus actos.
Tema 18. El Parlamento: sistemas unicamerales y bicamerales. Las Cortes Generales: composición y estructura. Iniciativa y procedimiento legislativo.
Tema 19. El Gobierno. Composición, funciones y estatuto de sus miembros. La función de dirección política. El control político del Gobierno. Gobierno y Administración.
Tema 20. La Constitución económica. La potestad financiera. Los presupuestos generales del Estado. Principios constitucionales del derecho tributario. El Tribunal de Cuentas.
Tema 21. El Estado autonómico. Criterios generales relativos a la distribución de competencias entre el Estado y las Comunidades Autónomas. Organización institucional de las Comunidades Autónomas. La autonomía local.
Tema 22. Los partidos políticos. Concepto de partido político. Formación. Estatutos. Organización y funcionamiento. Financiación. El control sobre los partidos políticos. Su disolución.
Tema 23. El régimen electoral general. Derecho de sufragio activo y pasivo. La administración electoral. El procedimiento electoral. Los recursos en materia electoral. Ordenación de las elecciones locales.
Tema 24. El Poder Judicial. La sumisión del juez a la ley y la independencia judicial; la inamovilidad. El Consejo General del Poder Judicial. Estructura y atribuciones.
Tema 25. Estatuto de Jueces y Magistrados. Prohibiciones e incompatibilidades. Régimen disciplinario. El gobierno interno de Tribunales.
Tema 26. El Ministerio Fiscal. Su posición constitucional. Principios configuradores. La autonomía funcional. Funciones. Órganos del Ministerio Fiscal. El Fiscal General del Estado, el Consejo Fiscal, la Junta de Fiscales de Sala y la Junta de Fiscales Superiores de las Comunidades Autónomas.
Tema 27. La Unión Europea. Los Tratados constitutivos, sus reformas y la situación tras el Tratado de Lisboa. La adhesión a la Unión. La retirada de la Unión. La suspensión de los derechos del Estado miembro. Los valores en los que se fundamenta la Unión, en especial, el Estado de Derecho. Principios que delimitan las competencias entre la Unión y los Estados miembros y principios que rigen el ejercicio de las competencias. Breve referencia a las Instituciones y órganos de la Unión Europa.
Tema 28. El sistema de fuentes de la Unión Europea y su relación con los ordenamientos nacionales. Derecho originario, derecho derivado, acuerdos internacionales y principios generales del Derecho. La aplicación del Derecho de la Unión Europea por los Estados miembros: efecto directo, primacía e interpretación conforme. Autonomía procedimental y los principios de efectividad y de equivalencia. Las consecuencias del incumplimiento del Derecho de la Unión, en especial, la responsabilidad patrimonial de los Estados miembros.
Tema 29. El Tribunal de Justicia de la Unión Europea: composición y competencias. El juez español y el derecho de la Unión Europea: articulo 4.bis LOPJ. La cuestión prejudicial ante el Tribunal de Justicia y ante el Tribunal General. Otros procedimientos ante el Tribunal de Justicia. La Fiscalía Europea.

### SUBJECT: civil
### NAME: Derecho Civil
### COLOR: bg-emerald-600
### ACTIVE_CLASS: bg-emerald-100 text-emerald-800 ring-1 ring-emerald-600

Tema 1. Concepto de derecho. La norma jurídica. Estructura y caracteres. Clases de normas jurídicas. Efectos esenciales de las normas. Inexcusabilidad de su cumplimiento y error de derecho. Exclusión voluntaria de la ley. Actos contrarios a norma imperativa y prohibitiva. El fraude de la ley: requisitos y efectos.
Tema 2. Límites temporales a la eficacia de las normas: Comienzo y fin de la vigencia. La derogación tácita. Doctrina general sobre el derecho transitorio. Exposición de las reglas uno a cuatro del Código Civil. El principio de irretroactividad.
Tema 3. Las fuentes del derecho. La costumbre. Los principios generales del derecho. La jurisprudencia. La jurisprudencia emanada del Tribunal Europeo de Derechos Humanos y del Tribunal de Justicia de la Unión Europea.
Tema 4. Teoría de la interpretación: las diferentes concepciones. La aplicación e interpretación de las normas jurídicas. La integración del principio de igualdad y el enfoque de género como informador del ordenamiento jurídico en la interpretación y aplicación de las normas jurídicas. La aplicación analógica. La equidad.
Tema 5. El Código Civil. Legislación civil especial. Los derechos civiles propios de las Comunidades Autónomas. Competencias de Estado y de las Comunidades Autónomas en materia de derecho civil. Sistema de fuentes y derecho supletorio. Derecho interregional.
Tema 6. La persona y la personalidad. Comienzo de la personalidad individual. El concebido. Extinción de la personalidad individual. El problema de la premoriencia.
Tema 7. Capacidad jurídica y capacidad de obrar. El estado civil de la persona. El título de estado civil y su prueba. La edad: la mayoría de edad, capacidad de los menores de edad. La emancipación y la habilitación de edad.
Tema 8. Las personas con discapacidad; la Convención Internacional sobre los Derechos de las Personas con Discapacidad. Las medidas de apoyo para el ejercicio de su capacidad jurídica: criterios generales. Las medidas voluntarias. La guarda de hecho. La curatela: autocuratela y nombramiento del curador. Ejercicio de la curatela. Extinción. El defensor judicial.
Tema 9. El domicilio. La ausencia. El defensor del desaparecido. La declaración de ausencia y sus efectos. La declaración de fallecimiento: requisitos y efectos.
Tema 10. La nacionalidad: concepto y naturaleza. Adquisición, conservación, pérdida y recuperación de la nacionalidad española. La doble nacionalidad. Prueba de la nacionalidad. La vecindad civil.
Tema 11. El Registro Civil; naturaleza. Principios rectores conforme a la Ley 20/2011, de 21 de julio. Organización y estructura. Hechos y actos inscribibles. Clases de asientos. Funciones de la Dirección General de Seguridad Jurídica y Fe Pública en esta materia: impugnación de sus resoluciones.
Tema 12. Las personas jurídicas: concepto, naturaleza y clases. Asociaciones y fundaciones. Capacidad. Nacionalidad, vecindad y domicilio de las personas jurídicas. Extinción.
Tema 13. El objeto del derecho. Las cosas y sus clases. Los frutos. El patrimonio. Los patrimonios separados.
Tema 14. Hecho, acto y negocio jurídico. Elementos esenciales del negocio jurídico. Sus clases. Negocios simulados, fiduciarios y fraudulentos.
Tema 15. Representación legal y representación voluntaria. La ratificación. La autocontratación.
Tema 16. Influencia del tiempo en el derecho: Su cómputo. La prescripción: concepto y clases. Examen de la prescripción extintiva. La caducidad.
Tema 17. El derecho real: concepto y caracteres. Clases. Derechos reales reconocidos en la legislación española. Régimen de los bienes y de los derechos reales en el Derecho Internacional Privado.
Tema 18. El derecho de propiedad. La función social de la propiedad. Limitaciones de utilidad pública y utilidad privada. La titularidad de los animales. Acciones que protegen el dominio. La acción reivindicatoria. Las relaciones de vecindad.
Tema 19. Modos de adquirir el dominio: concepto, sistemas y clases. La ocupación. Teoría del título y el modo. La tradición.
Tema 20. La accesión: concepto, naturaleza y clases. Examen de la accesión continua. Referencia a la accesión invertida.
Tema 21. La usucapión: requisitos y efectos. Los modos de perder el dominio. Referencia a las adquisiciones "a non domino".
Tema 22. La comunidad de bienes: concepto y clases. El condominio, concepto y reglas del Código Civil. Comunidades especiales.
Tema 23. La propiedad horizontal: naturaleza. Constitución. Contenido. Organización.
Tema 24. La posesión: concepto y clases. Adquisición, conservación y pérdida. Efectos durante el ejercicio de la posesión y al cesar en la misma. La tutela de la posesión.
Tema 25. El usufructo: concepto y naturaleza. Constitución y extinción del usufructo. Contenido: derechos y obligaciones. El derecho de aprovechamiento por turno en la Ley 4/2012. El derecho de superficie.
Tema 26. El derecho real de servidumbre: concepto, caracteres y clases. Servidumbres personales. Servidumbres reales. Constitución, contenido y extinción.
Tema 27. Servidumbres legales: concepto y naturaleza jurídica. Servidumbre de aguas, de paso, de medianería, de luces y vistas y de desagüe de edificios. Distancias y obras intermedias.
Tema 28. Derechos reales de garantía: concepto, clases y disposiciones generales. La prenda. La hipoteca mobiliaria y la prenda sin desplazamiento.
Tema 29. La hipoteca inmobiliaria: concepto, caracteres y clases. Requisitos subjetivos. Cosas y derechos susceptibles de ser hipotecados. Efectos y extensión. Extinción.
Tema 30. El Registro de la Propiedad. Sistemas. Delimitación de la materia inscribible: el artículo 2 de la Ley Hipotecaria. Títulos inscribibles y asientos registrales. La anotación preventiva: concepto, naturaleza y efectos. Clases.
Tema 31. Los principios hipotecarios. El principio de la inscripción. El principio de legalidad. El principio de legitimación registral. El principio de prioridad. El principio de tracto sucesivo.
Tema 32. La fe pública registral: examen del artículo 34 de la Ley Hipotecaria. La usucapión y el Registro de la Propiedad. La prescripción extintiva y el Registro de la Propiedad.
Tema 33. La obligación: concepto y evolución histórica. Elementos: sujeto, objeto y vínculo. Las fuentes de las obligaciones. Breve referencia a las obligaciones contractuales en Derecho internacional privado: el Reglamento (CE) 593/2008 (Roma I).
Tema 34. Clases de obligaciones. Obligaciones específicas y genéricas. Obligaciones unilaterales y recíprocas: examen del artículo 1.124 del Código Civil. Obligaciones puras, condicionales y a plazo. La "conditio iuris".
Tema 35. Obligaciones únicas y múltiples. Mancomunadas y solidarias. Obligaciones divisibles e indivisibles. Obligaciones con cláusula penal. Obligaciones pecuniarias. Obligaciones alternativas.
Tema 36. Causas de extinción de las obligaciones. El pago. Formas especiales de pago: imputación de pagos; pago por cesión de bienes y consignación. La pérdida de la cosa debida.
Tema 37. Condonación de la deuda. Confusión de derechos. Compensación. Novación. Asunción de la deuda.
Tema 38. El incumplimiento de la obligación imputable al deudor: el dolo y la culpa. El incumplimiento no imputable al deudor: caso fortuito y fuerza mayor. La mora del deudor. La mora del acreedor. El cumplimiento forzoso en forma específica. El resarcimiento de daños y perjuicios.
Tema 39. La responsabilidad patrimonial del deudor. La acción subrogatoria. La acción revocatoria o pauliana. El derecho de retención.
Tema 40. El contrato: concepto y función. El principio de la autonomía de la voluntad. Sus limitaciones. Clases. Referencia a los contratos típicos y atípicos; contratos mixtos; contratos normativos y de adhesión. Las condiciones generales de la contratación.
Tema 41. Capacidad para contratar. Prohibiciones legales y requisitos especiales de capacidad. El consentimiento y sus vicios: error, violencia, intimidación y dolo. Perfección y consumación del contrato.
Tema 42. El objeto del contrato: requisitos. La causa: normas del Código Civil. Forma de los contratos.
Tema 43. Interpretación de los contratos. Estipulaciones en favor de terceros. El contrato preparatorio y la opción.
Tema 44. Ineficacia de los contratos. Inexistencia, nulidad y anulabilidad: causas y efectos. La confirmación de los contratos. El riesgo imprevisible y la revisión de los contratos.
Tema 45. Defensa de los consumidores y usuarios I. Contratos con los consumidores y usuarios: Disposiciones generales y derecho de desistimiento. Condiciones generales y cláusulas abusivas. Breve referencia a la jurisprudencia sobre cláusulas abusivas en los contratos con entidades financieras.
Tema 46. Defensa de los consumidores y usuarios II. Contratos celebrados a distancia. Contratos celebrados fuera de establecimientos mercantiles. Garantías y servicios posventa. Responsabilidad civil por productos defectuosos. Referencia a la protección de los consumidores y usuarios frente a situaciones de vulnerabilidad social y económica.
Tema 47. El contrato de compraventa. La transmisión del dominio y el pacto de reserva del dominio. Elementos del contrato. Prohibiciones. La venta de la cosa ajena. Perfección del contrato.
Tema 48. Obligaciones del vendedor. Teoría de los riesgos. Entrega de la cosa. Saneamiento y evicción.
Tema 49. Obligaciones del comprador. Pago del precio y de intereses. Garantías en caso de aplazamiento: Examen del artículo 1.504 del Código Civil.
Tema 50. El retracto convencional. Tanteos y retractos legales. El contrato de permuta. La transmisión de créditos. El contrato de cesión.
Tema 51. La donación: su naturaleza. Clases. Elementos personales, reales y formales. Perfección del contrato. Efectos. Revocación y reducción de donaciones.
Tema 52. El contrato de arrendamiento: concepto, caracteres y clases. Régimen del Código Civil: constitución, contenido y extinción.
Tema 53. La Ley de Arrendamientos Urbanos de 24 de noviembre de 1994. Ámbito de aplicación. El contrato de arrendamiento de vivienda. Duración y desistimiento.
Tema 54. El contrato de arrendamiento de vivienda: derechos y obligaciones de las partes. Estudio especial de la renta. Cesión del contrato y subarriendo. Suspensión, resolución y extinción del contrato de arrendamiento de vivienda.
Tema 55. El contrato de arrendamiento de usos distintos del de vivienda. Derechos y obligaciones de las partes. Cesión del contrato y subarriendo. Resolución y extinción del contrato. Disposiciones comunes a los arrendamientos de vivienda y para usos distintos del de vivienda: fianza y formalización del contrato de arrendamiento.
Tema 56. Arrendamientos rústicos: legislación especial. Ámbito. Constitución, contenido y extinción. Duración y prórroga; sucesión del contrato. Aparcería.
Tema 57. Arrendamiento de obra: su regulación. Referencia a la Ley de Ordenación de la Edificación. Arrendamiento de servicios.
Tema 58. Contrato de sociedad: concepto, naturaleza y clases. Constitución. Administración, obligaciones y derechos. Extinción.
Tema 59. Contrato de mandato: concepto y clases. Elementos y efectos. Extinción. Contrato de mediación o corretaje.
Tema 60. Contrato de préstamo: sus especies. El comodato. El precario. El mutuo. Legislación sobre el préstamo usurario. Crédito al consumo.
Tema 61. El contrato de fianza: concepto, naturaleza y clases. Constitución, efectos y extinción.
Tema 62. Contrato de depósito: concepto, naturaleza y clases. Regulación legal. Contrato de hospedaje. El alquiler turístico.
Tema 63. Contratos aleatorios. La renta vitalicia. La transacción.
Tema 64. Obligaciones nacidas de la culpa extracontractual. Diferenciación y delimitación respecto de la contractual. El daño indemnizable. Daño emergente y lucro cesante. El daño moral. Breve referencia a las obligaciones extracontractuales en Derecho internacional privado: el Reglamento (CE) 864/2007 (Roma II).
Tema 65. La relación causal en la responsabilidad extracontractual. La culpa. La inversión de la carga de la prueba sobre la culpa. La concurrencia de culpas. El caso fortuito y la fuerza mayor.
Tema 66. Los supuestos de responsabilidad objetiva, con especial referencia a la responsabilidad civil en la circulación de vehículos a motor. La responsabilidad por hecho ajeno.
Tema 67. El Derecho de Familia. Sus caracteres. El matrimonio: concepto y naturaleza jurídica. Sistemas matrimoniales. Sistema vigente en el Derecho español. Las uniones de hecho.
Tema 68. Regulación del matrimonio en el Código Civil: requisitos. Nulidad: causas y efectos. Régimen del Derecho Internacional Privado en la materia.
Tema 69. Separación y disolución del matrimonio: causas y efectos. La separación de hecho. Conflicto de leyes y de jurisdicciones en materia de separación y disolución del matrimonio: breve referencia a los Reglamentos UE 2019/1111 y 1259/2010.
Tema 70. Efectos personales del matrimonio. Régimen económico matrimonial; sus clases. Sistema del Código Civil. El régimen matrimonial primario. Las capitulaciones matrimoniales: naturaleza y requisitos. Modificación de las capitulaciones.
Tema 71. El régimen de comunidad de gananciales: naturaleza, nacimiento y extinción. Bienes privativos de los cónyuges y bienes gananciales. Régimen de los bienes privativos. Cargas y obligaciones de la sociedad de gananciales.
Tema 72. Administración de la sociedad de gananciales y actos de disposición. Disolución y liquidación de la sociedad de gananciales.
Tema 73. El régimen de separación de bienes. El régimen de participación. El régimen matrimonial de bienes en el Derecho Internacional Privado.
Tema 74. La filiación y sus efectos. Modos de determinación. Acciones de reclamación y de impugnación. Las técnicas de reproducción asistida.
Tema 75. La adopción: requisitos, efectos y extinción. La llamada tutela automática. Guarda y acogimiento. Establecimiento de la filiación en el Derecho Internacional Privado.
Tema 76. La patria potestad en la normativa nacional y de la Unión Europea: su evolución. Elementos personales, efectos y extinción. El defensor judicial en relación con la patria potestad.
Tema 77. Derechos de la infancia y la adolescencia y su protección conforme a la LO 8/2021. Especial referencia a la protección civil de su integridad frente a la violencia. La aplicación del principio del interés superior del menor y del derecho a ser oído. Análisis del artículo 158 del Código Civil.
Tema 78. La perspectiva de género en el derecho de familia. Aplicación del principio de igualdad entre mujeres y hombres sobre los efectos personales y patrimoniales del matrimonio. Aplicación del principio de igualdad entre mujeres y hombres sobre los efectos de la ruptura del matrimonio o la pareja de hecho. Estudio de los artículos 61 a 69 de la LO 1/2004 de Medidas de Protección Integral contra la Violencia de Género.
Tema 79. El derecho de alimentos en la normativa nacional y de la Unión Europea. Clases de alimentos. Elementos personales: personas obligadas; orden de preferencia. Elementos reales. Cuantía. Exigibilidad y forma de cumplimiento. Extinción de la deuda alimenticia.
Tema 80. La tutela y guarda de los menores. Personas sujetas a tutela. Delación y constitución de la tutela. Incapacidades y excusas. Ejercicio de la tutela: obligaciones, atribuciones y derechos del tutor; actos prohibidos al mismo. Responsabilidad. Extinción. El defensor judicial. La tutela de hecho.
Tema 81. La sucesión mortis causa en la normativa nacional y de la Unión Europea. Clases. Heredero y legatario. Situaciones en que puede encontrarse la herencia. La herencia yacente. El derecho hereditario.
Tema 82. Apertura y delación de la herencia. Capacidad e incapacidad para suceder. Causas de indignidad.
Tema 83. Testamento: concepto y caracteres. Clases. Solemnidades generales. La capacidad para testar. Ineficacia, revocación, nulidad y caducidad del testamento.
Tema 84. El testamento ológrafo: requisitos y caducidad. Testamento abierto. Testamento cerrado. Testamentos especiales.
Tema 85. Institución de heredero: requisitos y formas de designación. Disposiciones testamentarias bajo condición, término y modo.
Tema 86. Sustituciones hereditarias: concepto y clases. Sustitución vulgar. La sustitución fideicomisaria: límites y efectos. Los fideicomisos.
Tema 87. Los legados: concepto y clases. Regulación según sus especies. Orden de prelación.
Tema 88. Interpretación de las disposiciones testamentarias. Ejecución. El albaceazgo. Capacidad para ser albacea. Clases de albaceas. Facultades y deberes. Duración y extinción del albaceazgo.
Tema 89. La sucesión forzosa. Sistemas. Naturaleza de la legítima. Su fijación. Intangibilidad de la legítima. Renuncia o transacción sobre la legítima futura. La cautela socini. Las legítimas de los descendientes y ascendientes. La legítima del cónyuge viudo.
Tema 90. La mejora: naturaleza y clases. Personas que pueden mejorar y ser mejoradas. Promesas de mejorar y no mejorar. Gravámenes sobre la mejora. Revocación. Desheredación y preterición.
Tema 91. Sucesión intestada. Modos de suceder, órdenes y grados. El derecho de representación. Orden de llamamiento en el Código Civil en la sucesión intestada.
Tema 92. Las reservas: concepto y clases. El derecho de acrecer. Las sucesiones en el Derecho Internacional Privado: breve referencia al Reglamento (UE) 650/2012.
Tema 93. Aceptación y repudiación de la herencia. Clases de aceptación. Capacidad para aceptar y repudiar la herencia. Forma y efectos. El beneficio de inventario y el derecho de deliberar.
Tema 94. La partición de la herencia: concepto y naturaleza. Legitimación para pedir la partición e intervención de los acreedores. Operaciones particionales. Efectos de la partición. Nulidad y rescisión.

### SUBJECT: penal
### NAME: Derecho Penal
### COLOR: bg-purple-600
### ACTIVE_CLASS: bg-purple-100 text-purple-800 ring-1 ring-purple-600

Tema 1. Los principios informadores del Derecho Penal; en especial, los principios de intervención mínima, legalidad, culpabilidad y no discriminación. El principio non bis in idem. La interpretación en el Derecho Penal. La analogía.
Tema 2. La teoría jurídica del delito. El sistema causalista. El sistema finalista. El concepto jurídico de delito en el Derecho Penal español. Clases de delitos. Sujetos, tiempo y lugar del delito.
Tema 3. Tipicidad. Estructura, clases y formulación de los tipos. La acción. Teorías causales. Causalidad e imputación objetiva. El criterio de la jurisprudencia penal.
Tema 4. El dolo. Clases de dolo. La delimitación del dolo eventual de la culpa consciente. Los elementos subjetivos del tipo.
Tema 5. El delito imprudente. Elementos. La incriminación de la imprudencia en el Código penal español.
Tema 6. El delito de omisión. Clases. La cláusula del artículo 11.
Tema 7. Antijuridicidad. Las causas de justificación: legítima defensa; estado de necesidad; obrar en cumplimiento de un deber o en el ejercicio legítimo de un derecho, oficio o cargo.
Tema 8. Imputabilidad, culpabilidad y causas que las excluyen. Anomalía o alteración psíquica. Intoxicación plena. Alteraciones en la percepción. La menor edad. El miedo insuperable.
Tema 9. Teoría del error en el Derecho penal. Clases de error. Consecuencias jurídicas.
Tema 10. La punibilidad. Las excusas absolutorias. Las condiciones objetivas de punibilidad. Las condiciones de perseguibilidad.
Tema 11. Circunstancias atenuantes. Análisis de las eximentes incompletas.
Tema 12. Circunstancias agravantes. Circunstancia mixta de parentesco. Análisis jurisprudencial de la agravante de género. El problema de la comunicabilidad de las circunstancias.
Tema 13. Las formas de aparición del delito. El iter criminis. Los actos preparatorios. La conspiración, la proposición y la provocación para delinquir. La tentativa. El desistimiento. El delito imposible.
Tema 14. La autoría. Autoría directa y mediata. La coautoría. La participación: fundamento; la accesoriedad. Inducción, cooperación necesaria y complicidad.
Tema 15. Las personas jurídicas. Referencias doctrinales sobre la responsabilidad penal de las personas jurídicas. Régimen de incriminación: análisis del artículo 31 bis del Código Penal. Penas y criterios de determinación. Responsabilidad civil.
Tema 16. Teoría del concurso. Concurso de leyes. Concurso de delitos. El delito continuado y el delito masa.
Tema 17. La pena: concepto, fundamento y fines. Clases de penas. Las penas privativas de libertad.
Tema 18. La pena de multa. Las penas privativas de derechos, con referencia a las prohibiciones de aproximación y comunicación con la víctima y de residencia en determinados lugares en los delitos de violencia doméstica y de género. Las penas accesorias.
Tema 19. Las consecuencias accesorias: el decomiso. Medidas aplicables a las agrupaciones sin personalidad jurídica.
Tema 20. Suspensión de la ejecución de las penas privativas de libertad. Especialidades en supuestos de violencia de género y doméstica. Revocación de la suspensión. Remisión definitiva de la pena.
Tema 21. Sustitución de las penas privativas de libertad. La libertad condicional.
Tema 22. La individualización de la pena. Reglas generales y especiales para la aplicación de la pena.
Tema 23. La medida de seguridad: concepto, fundamento y fines. Clases de medidas de seguridad. Determinación de la duración de la medida de seguridad de internamiento. Concurrencia de penas y medidas de seguridad.
Tema 24. La responsabilidad civil derivada del delito. Las costas procesales.
Tema 25. Extinción de la responsabilidad criminal. La cancelación de los antecedentes penales. Breve referencia al registro central de delincuentes sexuales y trata de seres humanos.
Tema 26. El Derecho Penitenciario. La relación jurídica penitenciaria. El juez de vigilancia. El tratamiento penitenciario.
Tema 27. El homicidio. El asesinato. Cooperación e inducción al suicidio. La eutanasia: configuración legal, requisitos y procedimiento para la realización de la prestación de ayuda para morir.
Tema 28. El delito de aborto. Condiciones de la interrupción voluntaria del embarazo. Tipos penales. Lesiones al feto. Delitos relativos a la manipulación genética.
Tema 29. Las lesiones. Tipos agravados. Especial referencia a la mutilación genital. La participación en riña. El consentimiento en las lesiones. Delitos cometidos través de medios tecnológicos y de la comunicación, que producen graves riesgos para la vida y la integridad de las personas menores edad.
Tema 30. Los delitos de violencia sobre la mujer por su pareja o expareja, su configuración en la LO 1/2004. Análisis de los delitos de maltrato físico y psíquico, maltrato habitual, amenazas, coacciones, acoso y divulgación no consentida de imágenes o grabaciones de carácter íntimo.
Tema 31. Delitos contra la libertad. Detenciones ilegales y secuestros. Amenazas. Coacciones. Delito de matrimonio forzado. Delito de acoso.
Tema 32. Torturas y otros delitos contra la integridad moral. Trata de seres humanos: modalidades. Especial referencia a la trata con fines de explotación sexual y su protección internacional.
Tema 33. Delitos contra la libertad sexual. Agresiones sexuales. Agresiones sexuales a menores de dieciséis años. Excusa Absolutoria.
Tema 34. Acoso sexual. Delitos de exhibicionismo y provocación sexual. Delitos relativos a la prostitución y a la explotación sexual y corrupción de menores. Disposiciones comunes a los capítulos anteriores.
Tema 35. Omisión del deber de socorro. Descubrimiento y revelación de secretos. Delitos contra los sistemas de información: espionaje informático. Allanamiento de morada, domicilio de personas jurídicas y establecimientos abiertos al público.
Tema 36. Delitos contra el honor. La calumnia. La injuria. Disposiciones generales.
Tema 37. Delitos contra las relaciones familiares. Matrimonios ilegales. Suposición de parto y alteración de la paternidad, estado o condición del menor. Delitos contra los derechos y deberes familiares.
Tema 38. Delitos contra el patrimonio y contra el orden socioeconómico. El hurto. El robo. La extorsión. Robo y hurto de uso de vehículos a motor. Usurpación. Sustracción de cosa propia a su utilidad social o cultural.
Tema 39. Las defraudaciones. Las estafas. Administración desleal. Apropiación indebida. Defraudaciones de fluido eléctrico y análogas.
Tema 40. Frustración de la ejecución: alzamiento de bienes y utilización de bienes embargados. Insolvencias punibles. Alteración de precios en concursos y subastas públicas. Los daños: sabotaje informático.
Tema 41. Delitos relativos a la propiedad intelectual e industrial, al mercado y a los consumidores. Corrupción en los negocios.
Tema 42. Delitos societarios: clases. La receptación y el blanqueo de capitales. Delitos de financiación ilegal de partidos políticos.
Tema 43. Delitos contra la Hacienda Pública y contra la Seguridad Social.
Tema 44. Delitos contra los derechos de los trabajadores. Delitos contra los derechos de los ciudadanos extranjeros.
Tema 45. Delitos sobre la ordenación del territorio y el urbanismo. Delitos sobre el patrimonio histórico. Delitos contra los recursos naturales y el medio ambiente. Delitos contra la flora y fauna. Delitos contra los animales.
Tema 46. Delitos contra la seguridad colectiva: delitos de riesgo catastrófico. Incendios. Breve referencia a los delitos contra la salud pública relacionados con el comercio.
Tema 47. Delitos relativos a drogas tóxicas, estupefacientes y sustancias psicotrópicas.
Tema 48. Delitos contra la seguridad vial. Clases. Delito de abandono del lugar del accidente. La norma concursal del artículo 382.
Tema 49. Las falsedades: falsificación de moneda y efectos timbrados. Falsedades documentales. Usurpación del estado civil. Usurpación de funciones públicas. Intrusismo.
Tema 50. Delitos contra la Administración Pública. Prevaricación de los funcionarios públicos y otros comportamientos injustos. Abandono de destino y de la omisión del deber de perseguir delitos. Desobediencia y denegación de auxilio. Infidelidad en la custodia de documentos y de la violación de secretos.
Tema 51. Cohecho. Tráfico de influencias. Malversación.
Tema 52. Fraudes y exacciones ilegales. Negociaciones y actividades prohibidas a los funcionarios públicos y de los abusos en el ejercicio de su función. Delito de enriquecimiento ilícito de cargos públicos.
Tema 53. Delitos contra la Administración de Justicia: Prevaricación. Omisión de los deberes de impedir delitos o promover su persecución. Encubrimiento. Realización arbitraria del propio derecho.
Tema 54. Acusación y denuncias falsas. Simulación de delito. Falso testimonio. Obstrucción a la Justicia y deslealtad profesional. Quebrantamiento de condena y de medidas cautelares. Delitos contra la Administración de Justicia de la Corte Penal Internacional.
Tema 55. Delitos contra la Constitución: rebelión. Delitos contra la Corona.
Tema 56. Delitos contra las Instituciones del Estado y la división de poderes.
Tema 57. Delitos relativos al ejercicio de los derechos fundamentales y libertades públicas. Delitos cometidos con ocasión del ejercicio de los derechos fundamentales y libertades públicas garantizados por la Constitución. Delitos contra la libertad de conciencia, los sentimientos religiosos y el respeto a los difuntos.
Tema 58. Delitos cometidos por los funcionarios públicos contra las garantías constitucionales. Delito de ultrajes a España.
Tema 59. Delitos contra el orden público: Atentados contra la autoridad, sus agentes y los funcionarios públicos, resistencia y desobediencia. Desórdenes públicos. Disposición común.
Tema 60. Tenencia, tráfico y depósito de armas, municiones o explosivos.
Tema 61. Organizaciones y grupos criminales. Organizaciones y grupos terroristas. Delitos de terrorismo.
Tema 62. Estructura y caracteres de los títulos XXIII y XXIV del Código Penal. Especial referencia a los delitos de genocidio y de lesa humanidad.
Tema 63. Legislación penal especial: Ley de represión del contrabando. Los delitos electorales. Protección penal del Jurado. El Código Penal Militar de 2015. Especialidades de su parte general. Sucinta noción de los delitos militares.
Tema 64. El Derecho Penal de Menores: concepto y evolución. Principios informadores de La Ley Orgánica 5/2000, de 12 de enero, de Responsabilidad Penal del Menor. Especial referencia a los supuestos de responsabilidad penal de los menores y medidas comprendidas en la Ley.

### SUBJECT: procesal-civil
### NAME: Derecho Procesal Civil
### COLOR: bg-blue-500
### ACTIVE_CLASS: bg-blue-100 text-blue-800 ring-1 ring-blue-500

Tema 1. El Derecho procesal. Fuentes del Derecho procesal, en general; el papel de los principios generales; costumbre y usos forenses. Normas procesales y normas sustantivas. La ley procesal en el tiempo y en el espacio.
Tema 2. Planta y organización de los Tribunales Civiles: Tribunal Supremo, Tribunales Superiores de Justicia y Audiencias Provinciales. Los Tribunales de Instancia: Sección Civil; Sección de Familia, Infancia y Capacidad; Sección de Mercantil; y Sección de Violencia sobre la Mujer. Oficinas de Justicia en el municipio.
Tema 3. Ordenación y funciones del Cuerpo de Letrados de la Administración de Justicia. Personal al servicio de la Administración de Justicia: clases y funciones. Organización de la oficina judicial: principios que informan el sistema; servicios comunes procesales.
Tema 4. La predeterminación legal del juez. Predeterminación legal del órgano jurisdiccional que ha de conocer de todo asunto; predeterminación legal e integración subjetiva del órgano, unipersonal o colegiado; el derecho fundamental al juez predeterminado legalmente: titulares y ejercicio del derecho. Abstención y recusación de Jueces y Magistrados: causas y procedimiento.
Tema 5. El proceso. Naturaleza jurídica. El proceso y la potestad jurisdiccional. Principios informadores de los distintos procesos: A) Principio de audiencia o de contradicción; principio de igualdad de las partes; B) Principio dispositivo y de aportación de parte; el principio Iura novit curia.
Tema 6. Los actos procesales. Proceso y actos procesales. Concentración, orden sucesivo de los actos y preclusión. El impulso procesal. Publicidad e inmediación. Requisitos de los actos procesales: a) de lugar; b) de tiempo: términos y plazos; cómputo de los plazos; c) de forma (consideración de la lengua oficial) d) actos por videoconferencia o mediante presencia telemática. Defectos de los actos; nulidad, anulabilidad, irregularidad; subsanación de defectos.
Tema 7. Las resoluciones de los órganos jurisdiccionales. Clases de resoluciones judiciales: contenido y características. Las resoluciones de los Letrados de la Administración de Justicia. Las resoluciones en los órganos jurisdiccionales colegiados: deliberación, votación y discordias. Invariabilidad y vinculación de las resoluciones. Aclaración y corrección.
Tema 8. Actos de comunicación. Actos de comunicación con las partes y otros sujetos: notificaciones, citaciones, emplazamientos y requerimientos, especial referencia a los sistemas electrónicos y telemáticos. Actos de comunicación con otros órganos: exhortos, oficios y mandamientos.
Tema 9. Derechos de los justiciables. Pretensión y acción: principales teorías. Clases de acciones. El derecho fundamental a obtener una tutela judicial efectiva: principales aspectos definidos por la jurisprudencia constitucional.
Tema 10. Defensa y representación procesal de los sujetos jurídicos. El Abogado: su estatuto y función procesal. El Procurador de los Tribunales: su estatuto y función: representación procesal de la parte y auxilio del órgano judicial. Intervención necesaria y libre de Abogado y Procurador. El Ministerio Fiscal: su función en los procesos civiles. Defensa y representación de las Administraciones Públicas.
Tema 11. El proceso civil y el Derecho procesal civil. Los presupuestos procesales: concepto y relevancia jurídica. La jurisdicción como presupuesto del proceso; extensión y límites; la inmunidad jurisdiccional. La «competencia judicial internacional»: concepto, normas internas y tratados internacionales sobre «competencia internacional»; su tratamiento procesal. Convenios internacionales sobre reconocimiento y ejecución de resoluciones judiciales.
Tema 12. Competencia de los tribunales civiles. Clases de competencia. Competencia objetiva: criterios para determinarla. Competencia funcional. Tratamiento procesal de esas clases de competencia. Competencia territorial; sumisión y fueros legales. Declinatoria.
Tema 13. El objeto del proceso civil. Relevancia técnico-jurídica del objeto del proceso. Elementos delimitadores del objeto; el petitum; la causa de pedir.
Tema 14. Acumulación de acciones; presupuestos; acumulación inicial de pretensiones y acumulación pendiente el proceso; acumulación eventual. Acumulación de autos.
Tema 15. Las partes del proceso civil. Capacidad para ser parte. Capacidad procesal; la intervención en el proceso de personas con discapacidad. Representación; sus clases. Tratamiento procesal. La legitimación en el proceso civil. Concepto y clases de legitimación. La legitimación por sustitución. La legitimación para la defensa de consumidores y usuarios. La legitimación para la defensa del derecho a la igualdad de trato y no discriminación.
Tema 16. Pluralidad de partes. El litisconsorcio; clases de litisconsorcio. La intervención procesal. Litisdenunciación. La sucesión procesal: el cambio de partes.
Tema 17. Actos previos al proceso. Diligencias preliminares. Medios adecuados de solución de controversias (MASC): concepto, naturaleza jurídica y aspectos más relevantes. La conciliación preprocesal. La mediación en asuntos civiles: concepto, principios y procedimiento.
Tema 18. Las medidas cautelares, I. Concepto. Presupuestos (apariencia de buen derecho, peligro por la mora procesal, proporcionalidad, prestación de caución). Características. Medidas cautelares específicas.
Tema 19. Las medidas cautelares II. Procedimiento para la adopción de la tutela cautelar. Modificación y alzamiento de las medidas cautelares. Especial referencia a las medidas de protección en supuestos de violencia de género y a las medidas de protección a menores y adolescentes.
Tema 20. Tipos de procesos declarativos: ordinarios y especiales. Cuestiones incidentales. Concepto. Clases. Procedimiento. Determinación del proceso que corresponde. Las cuestiones prejudiciales en la Ley de Enjuiciamiento Civil.
Tema 21. La demanda. Concepto. Requisitos. Efectos. La admisión de la demanda y las funciones de los Letrados de la Administración de Justicia.
Tema 22. La contestación a la demanda y otras actitudes del demandado. Excepciones y sus clases. Reconvención. Rebeldía.
Tema 23. La audiencia previa al juicio. Momento. Sujetos y finalidades. El Juicio y su desarrollo.
Tema 24. La prueba. Concepto de prueba. Las afirmaciones fácticas como objeto de la prueba; afirmaciones fácticas exentas de prueba: admitidas y notorias. La prueba del Derecho. Carga de la prueba. Proposición y admisión de la prueba: licitud de la prueba; pertinencia y utilidad. Anticipación y aseguramiento de la prueba. Valoración de la prueba. La perspectiva de género como criterio integrador.
Tema 25. Los medios de prueba. Documentos: aportación al proceso. Clases. Valor probatorio.
Tema 26. El interrogatorio de las partes. Reconocimiento judicial. Las presunciones: concepto, naturaleza y clases de presunciones.
Tema 27. Testigos. Peritos. Medios de reproducción del sonido o la imagen e instrumentos de archivo. Diligencias finales.
Tema 28. La sentencia. Concepto y clases. Formación interna. Motivación de la sentencia. Requisitos internos de la sentencia: claridad, precisión y exhaustividad o congruencia. Estructura externa de la sentencia.
Tema 29. La cosa juzgada y las resoluciones que la producen. Cosa juzgada formal y cosa juzgada material. Naturaleza y efectos de la cosa juzgada material (función positiva y función negativa de la cosa juzgada). Límites subjetivos, objetivos y temporales de la cosa juzgada. Tratamiento procesal de la cosa juzgada.
Tema 30. Crisis procesales. A) Paralización del proceso: suspensión e interrupción. B) Terminación anormal del proceso: Renuncia. Desistimiento. Allanamiento. Admisión de hechos. Transacción. Caducidad de la instancia. Sobreseimiento.
Tema 31. El juicio verbal. Demanda y contestación. Reconvención y acumulación de acciones. Reglas de postulación y competencia. Vista oral, supuestos de celebración. Inasistencia de las partes a la vista. Desarrollo de la vista. La resolución sobre los defectos procesales y su subsanación. Recursos frente a las resoluciones interlocutorias. Problemas que se plantean en materia de prueba. El procedimiento testigo.
Tema 32. Juicios verbales de carácter plenario y sumario. El verbal de desahucio. El precario. El juicio sobre tutela posesoria. La tutela de derechos reales inscritos. El juicio de alimentos. El juicio verbal en materias de compraventas a plazos y arrendamientos financieros.
Tema 33. Protección jurisdiccional de los derechos fundamentales de la persona: garantía procesal civil. Protección jurisdiccional civil de los derechos al honor, a la intimidad y a la propia imagen. Procedimiento civil para ejercicio del derecho de rectificación ante noticias inexactas y perjudiciales.
Tema 34. Los procesos especiales para proveer de apoyos a las personas con discapacidad. Caracteres generales. Competencia. Legitimación. Personación de la persona demandada. Especialidades procedimentales. La sentencia. La revisión de las medidas de apoyo y la reintegración de la capacidad. Medidas cautelares; el internamiento no voluntario. Los procesos sobre filiación, paternidad y maternidad.
Tema 35. Los procesos matrimoniales y sus clases. Competencia. Procedimientos: A) de nulidad, separación y divorcio contencioso. B) de separación o divorcio de mutuo acuerdo. La audiencia de los hijos menores o con discapacidad precisados de apoyo. Delimitación de competencias entre las Secciones de Familia, Infancia y Capacidad y las Secciones de Violencia sobre la Mujer. Análisis del artículo 49.bis de la Ley de Enjuiciamiento Civil en supuestos de violencia de género. Competencia judicial internacional de los Tribunales españoles en procesos matrimoniales y de relaciones paternofiliales. Reconocimiento y ejecución de sentencias dictadas por Tribunales extranjeros en procesos de familia y menores.
Tema 36. Medidas provisionales previas a la demanda de nulidad, separación o divorcio. Solicitud, comparecencia y resolución. Confirmación o modificación de las medidas provisionales previas a la demanda. Medidas provisionales derivadas de la admisión de la demanda de nulidad, separación o divorcio. Medidas definitivas. Modificación de las medidas definitivas. Ejecución forzosa de los pronunciamientos sobre medidas. Eficacia civil de las resoluciones de los Tribunales Eclesiásticos.
Tema 37. Procedimientos relacionados con la protección de menores. Autorización judicial para el ingreso de menores con problemas de conducta en centros de protección específicos y para la entrada en domicilio o lugar cerrado en ejecución de medidas de protección. Oposición a las resoluciones administrativas en materia de protección de menores y procedimiento para determinar la necesidad de asentimiento en la adopción. Restitución de menores en supuestos de sustracción internacional.
Tema 38. Procedimientos para la división judicial de patrimonios. A) De la división de la herencia: a) Procedimiento para la división de la herencia. b) La intervención del caudal hereditario. c) La administración del caudal hereditario. B) Procedimiento para la liquidación del régimen económico matrimonial. Atribución de los animales de compañía.
Tema 39. El proceso monitorio. Concepto y características. Naturaleza. Antecedentes. Casos en que procede. Competencia. Procedimiento: Petición inicial y documentos. Admisión. Control de oficio de cláusulas abusivas en los contratos celebrados en materia de consumo. La transformación del procedimiento. La cosa juzgada. Especialidades del proceso monitorio de la Unión Europea.
Tema 40. El juicio cambiario. Concepto y características. Naturaleza. Casos en que procede. Competencia. Procedimiento: A) Iniciación, demanda, requerimiento de pago y embargo preventivo. B) El pago y el alzamiento del embargo. C) La oposición cambiaria; sustanciación. La sentencia sobre la oposición y su eficacia.
Tema 41. Los recursos. Concepto. El derecho a recurrir en casos especiales. Presupuestos de admisibilidad de los recursos. Clases de recursos. Efectos de los recursos y de su desistimiento. Recursos no devolutivos: Reposición. Características. Resoluciones y diligencias contra las que procede. Procedimiento. Recurso de revisión. Recurso de queja.
Tema 42. El recurso de apelación. Apelación y segunda instancia; el derecho a la segunda instancia. Resoluciones contra las que procede apelación. Ámbito del recurso. Sustanciación del recurso; la prueba en la apelación. Adhesión a la apelación.
Tema 43. Los recursos extraordinarios. El recurso de casación.
Tema 44. Los medios de impugnación de las sentencias firmes. La rescisión en rebeldía. La revisión de las sentencias firmes.
Tema 45. La nulidad de actuaciones. Regulación legal: principios fundamentales a los que responde. Los vicios o motivos que la determinan. La conservación de los actos. La regla de la subsanación de los defectos y sus límites. El incidente de nulidad. El incidente excepcional de nulidad de actuaciones.
Tema 46. La ejecución forzosa. Concepto y naturaleza. El título ejecutivo y sus clases. El título ejecutivo europeo. Ejecución de resoluciones extranjeras en el espacio judicial europeo. Ejecución de laudos arbitrales nacionales y extranjeros.
Tema 47. Las partes en el proceso de ejecución. La demanda ejecutiva. Competencia. El despacho de la ejecución. Oposición a la ejecución. Suspensión de la ejecución.
Tema 48. Ejecución provisional. Concepto y naturaleza. Presupuestos. Despacho de la ejecución. Oposición a la ejecución provisional. Revocación o confirmación de la sentencia provisionalmente ejecutada.
Tema 49. Ejecución dineraria. Supuestos en que procede. Integración del título. Requerimiento de pago. Embargo de bienes, I. Concepto. Naturaleza. Requisitos. Objeto (bienes no embargables).
Tema 50. Embargo de bienes, II. Localización de los bienes a embargar. Mejora y reducción del embargo. Órgano del embargo. Práctica del embargo. Reembargo. Tercería de dominio.
Tema 51. El procedimiento de apremio. Disposiciones generales para la realización de los bienes embargados. Valoración de los bienes embargados. El convenio de realización. La subasta de los bienes trabados, la subasta electrónica. Alternativas a la subasta judicial. La administración para pago. Tercería de mejor derecho.
Tema 52. Ejecución no dineraria. Disposiciones generales. Ejecución por deberes de entregar cosas. Ejecución por obligaciones de hacer y no hacer. Condena a emitir una declaración de voluntad. Liquidación de daños y perjuicios, frutos y rentas y la rendición de cuentas.
Tema 53. Las ejecuciones hipotecarias. Las opciones procesales del acreedor hipotecario. El proceso de ejecución común. El proceso especial de ejecución hipotecaria: presupuestos procesales. Desarrollo de la ejecución. Suspensión y oposición a la ejecución. Remisión al juicio ordinario. El proceso especial de ejecución de la prenda sin desplazamiento posesorio.
Tema 54. Antecedentes y principios generales de la Ley Concursal. Naturaleza del concurso. El órgano judicial: competencia objetiva y territorial. Líneas generales del procedimiento. La exoneración del pasivo insatisfecho. Planes de reestructuración.
Tema 55. El arbitraje. Concepto y clases de arbitraje. Ámbito del arbitraje. El Convenio arbitral. Los árbitros. El nombramiento judicial de árbitros. Las medidas cautelares. El procedimiento arbitral. El laudo: anulación y revisión.
Tema 56. Expediente de jurisdicción voluntaria. Disposiciones generales: objeto y ámbito de aplicación. Competencia. Legitimación y postulación. Intervención del Ministerio Fiscal. Prueba. Tramitación simultánea o posterior de expedientes o procesos. Gastos. Ajustes para personas con discapacidad. Normas comunes de tramitación de los expedientes de jurisdicción voluntaria: normas de derecho internacional privado y normas de tramitación.
Tema 57. Expedientes de jurisdicción voluntaria en materia de personas I: autorización o aprobación judicial del reconocimiento de la filiación no matrimonial. De la autorización o aprobación judicial del cambio del sexo de personas mayores de doce años y menores de catorce. De la aprobación judicial de la nueva modificación de la mención registral relativa al sexo con posterioridad a una reversión de la rectificación de la mención registral. Habilitación para comparecer en juicio y nombramiento de defensor judicial. Expediente sobre adopción. Expediente de provisión de medidas judiciales de apoyo a personas con discapacidad.
Tema 58. Expedientes de jurisdicción voluntaria en materia de personas II: tutela, curatela y guarda de hecho. Concesión judicial de la emancipación y del beneficio de la mayoría de edad. Protección del patrimonio de las personas con discapacidad. Derecho al honor, intimidad y propia imagen del menor o persona con discapacidad. Expedientes para la autorización o aprobación judicial para la realización de actos de disposición, gravamen u otros que se refieran a los bienes y derechos de menores y personas con discapacidad. Expediente de declaración de ausencia y fallecimiento. Expediente para la extracción de órganos de donantes vivos. Expedientes de jurisdicción voluntaria relativos a declaraciones judiciales sobre hechos pasados.
Tema 59. Expedientes de jurisdicción voluntaria en materia de familia. Incidencia de la violencia de género en su resolución; análisis del artículo 156 del Código Civil. Expedientes de jurisdicción voluntaria relativos al Derecho sucesorio. Expedientes de jurisdicción voluntaria relativos al Derecho de obligaciones. Expedientes de jurisdicción voluntaria relativos a los derechos reales. Expediente de subasta voluntaria.
Tema 60. Costas y gastos procesales. La condena en costas. La tasación de costas. La impugnación de las costas. Solicitud de exoneración y moderación de costas. La asistencia jurídica gratuita.

### SUBJECT: procesal-penal
### NAME: Derecho Procesal Penal
### COLOR: bg-indigo-600
### ACTIVE_CLASS: bg-indigo-100 text-indigo-800 ring-1 ring-indigo-600

Tema 1. El proceso penal. Los sistemas procesales penales en general: proceso inquisitivo; proceso acusatorio. El sistema procesal penal de la Ley de Enjuiciamiento Criminal: principio del juez imparcial, separación de instrucción y enjuiciamiento. El juez de garantías. Principios del proceso penal. El principio de oportunidad. La perspectiva de género en la jurisdicción penal.
Tema 2. Planta y organización de los Tribunales penales: Tribunal Supremo; Audiencia Nacional; Tribunal Central de Instancia: Secciones de Instrucción, de lo Penal, de Menores y de Vigilancia Penitenciaria, Tribunales Superiores de Justicia, Audiencias Provinciales, Tribunales de Instancia. Secciones de los Tribunales de Instancia: Secciones de Instrucción, de Violencia contra la Infancia y la Adolescencia, de Violencia sobre la Mujer, de lo Penal, de Menores, de Vigilancia Penitenciaria.
Tema 3. La jurisdicción como presupuesto del proceso; límites de la jurisdicción penal ordinaria. Competencia objetiva y funcional. Aforamientos y privilegios procesales. Inmunidad de jurisdicción. Conflictos de jurisdicción trasnacionales.
Tema 4. La competencia territorial. La competencia por conexión. Tratamiento procesal de la jurisdicción y de la competencia: inhibición espontánea; requerimientos de inhibición; cuestiones de competencia.
Tema 5. Las partes del proceso penal. El Ministerio Fiscal. El acusador particular; la acusación popular. El acusador privado. El actor civil. La Abogacía del Estado. El perjudicado.
Tema 6. Estatuto jurídico de la víctima: Ley 4/2015, de 27 de abril. Ámbito. Concepto general de víctima. Derechos básicos. Participación en el proceso penal: en el proceso y en la ejecución. La mediación en asuntos penales, especial referencia a la disposición adicional novena de la Ley de Enjuiciamiento Criminal introducida por la Ley Orgánica 1/2025, de 2 de enero, de medidas en materia de eficiencia del Servicio Público de Justicia. Medidas de protección a la víctima. Obligación de reembolso.
Tema 7. El investigado. Presencia y ausencia del investigado: la rebeldía. El partícipe a título lucrativo. El responsable civil. Representación y defensa de las partes: persona física y persona jurídica; defensa de oficio y beneficio de justicia gratuita. Costas del proceso penal.
Tema 8. El objeto del proceso penal. El hecho punible y el objeto del proceso. Delimitación del objeto. Unidad y pluralidad de objetos: conexión de delitos. Acción penal y pretensión punitiva.
Tema 9. La llamada acción civil ex delicto. Régimen procesal de la responsabilidad civil en la Ley de Enjuiciamiento Criminal. Las cuestiones prejudiciales.
Tema 10. La investigación preprocesal y sus diferencias con la instrucción. La investigación por el Ministerio Fiscal. Las actuaciones de la Policía Judicial. El agente encubierto. La entrega vigilada. El proceso por delitos graves. El proceso penal tipo; sus fases; carácter supletorio de su regulación. Incoación del proceso: denuncia; querella; atestado; incoación de oficio. El plazo para la instrucción.
Tema 11. El sumario. Comprobación del delito: cuerpo del delito. Identificación del presunto delincuente y sus circunstancias personales. La inspección ocular. Declaraciones testificales y actos de pericia en el sumario. Aportación de documentos y otras piezas de convicción. Los medios de investigación sobre la persona: registros personales, reconocimientos médicos y pruebas alcoholimétricas. Perfiles de ADN.
Tema 12. Medidas limitadoras de derechos fundamentales: entrada y registro en lugar cerrado. Registro de libros y papeles. Detención y apertura de la correspondencia escrita y telegráfica. Utilización de la información obtenida en otros procedimientos distintos; los descubrimientos casuales.
Tema 13. Medios de investigación tecnológica. Disposiciones comunes. Interceptación de las comunicaciones telefónicas y telemáticas. Captación y grabación de las comunicaciones orales mediante la utilización de dispositivos electrónicos. Utilización de dispositivos técnicos de seguimiento. Registro de dispositivos de almacenamiento masivo. Registros remotos de equipos informáticos. Medidas de aseguramiento.
Tema 14. Medidas cautelares personales. Detención y prisión provisional. La incomunicación. La libertad provisional y otras medidas cautelares personales. El procedimiento de habeas corpus.
Tema 15. Las medidas cautelares en protección de la víctima de violencia de género y sus hijos menores. Estudio de los artículos 544.bis a 544.quinquies de la Ley de Enjuiciamiento Criminal y su reflejo en la Ley Orgánica 1/2004. Su aseguramiento con medios electrónicos.
Tema 16. Medidas cautelares reales. Conservación de los efectos e instrumentos del delito. Aseguramiento de responsabilidades pecuniarias: fianzas y embargos.
Tema 17. La posición del investigado en el proceso penal. Audiencia de investigado y sus garantías. El investigado en el procedimiento penal ordinario: decisión judicial sobre su situación personal; el procesamiento y la indagatoria. Procesos sin auto de procesamiento: posición del investigado en el procedimiento abreviado y en el juicio por delitos leves.
Tema 18. El denominado periodo intermedio; auto de conclusión del sumario, eventual revocación del auto y nuevas diligencias y resoluciones. El sobreseimiento y sus clases. El auto de apertura del juicio oral.
Tema 19. Los artículos de previo pronunciamiento. Las calificaciones provisionales de las partes: adhesión víctimas y perjudicados. Conformidad del acusado.
Tema 20. La prueba. Concepto; objeto; medios de prueba. Proposición, admisión o denegación; prueba anticipada; proposición en el acto del juicio; prueba acordada ex officio. Las pruebas obtenidas con violación de derechos fundamentales. La prueba producida irregularmente.
Tema 21. Valor probatorio de lo actuado en el sumario; análisis de los artículos 714 y 730 de la Ley de Enjuiciamiento Criminal. La prueba preconstituida, especial referencia a la intervención de una persona menor de catorce años o una persona con discapacidad necesitada de especial protección en condición de testigo. La declaración del acusado. Pruebas testifical, pericial y de inspección ocular. La prueba documental. La prueba por indicios. La declaración de la víctima del delito.
Tema 22. El juicio oral. Preparación. Comienzo del juicio oral; desarrollo y conclusión. Medidas de protección de las víctimas, menores y personas con discapacidad durante el juicio oral. La «tesis» del art. 733 de la Ley de Enjuiciamiento Criminal. La suspensión del juicio oral: causas y consecuencias.
Tema 23. La sentencia: estructura y contenido; exhaustividad y motivación. Valoración de la prueba. La perspectiva de género como elemento interpretativo. La presunción de inocencia. El principio «in dubio pro-reo». La congruencia. Doctrina derivada de las sentencias del Tribunal Europeo de Derechos Humanos en el ámbito del proceso penal. La doble instancia: recursos contra las sentencias de la Audiencia Provincial.
Tema 24. Efectos de la sentencia. La cosa juzgada penal: concepto; sentido del principio non bis in idem. Identidades que han de concurrir para apreciar la cosa juzgada penal. Posiciones sobre la eficacia positiva o prejudicial de la cosa juzgada penal. Tratamiento procesal de la cosa juzgada penal.
Tema 25. El procedimiento abreviado. Ámbito y competencia. Peculiaridades en cuanto a la iniciación. La actuación de la Policía Judicial. La intervención del Ministerio Fiscal.
Tema 26. Diligencias y prevenciones judiciales. Las diligencias previas. Información de derechos, prueba anticipada. Conclusión de la fase instructora, la conformidad por reconocimiento de hechos.
Tema 27. La fase intermedia. Petición de ampliación de prueba. El sobreseimiento y sus peculiaridades. Los escritos de acusación. La apertura del juicio oral. Los escritos de defensa.
Tema 28. La fase de juicio oral: audiencia preliminar, admisión de pruebas, señalamiento del juicio e información a la víctima. Celebración del juicio oral, especialidades: a) juicio en ausencia del acusado y del responsable civil; b) alegaciones previas, c) conformidad. Desarrollo del juicio. La sentencia; especialidades: a) sentencia oral; b) conformidad de las partes sobre la firmeza inicial de la sentencia; c) principio acusatorio; d) notificación. La impugnación de la sentencia; apelación y anulación. Ejecución de sentencias.
Tema 29. El procedimiento para el enjuiciamiento rápido de determinados delitos. Ámbito de aplicación. Actuaciones de la Policía Judicial. Diligencias urgentes ante el Juzgado de guardia; instrucción y conclusión. Preparación del juicio oral; petición de apertura de juicio oral o de sobreseimiento, escritos de acusación y defensa, señalamiento de juicio oral. Especialidades de la conformidad. Desarrollo del juicio y sentencia. Impugnación de la sentencia. El proceso por aceptación de decreto.
Tema 30. La regulación procesal del decomiso: la realización anticipada de los efectos judiciales, la intervención de terceros afectados por el decomiso y el decomiso autónomo. Funciones y fines de la Oficina de Recuperación y Gestión de Activos.
Tema 31. El proceso ante el Tribunal del Jurado. Competencia: objetiva; territorial; funcional. La fase de instrucción: la instrucción complementaria. La fase de juicio oral: A) Trámites precedentes: el auto de «hechos justiciables»; B) Celebración del juicio oral: constitución del Jurado; la vista; suspensión del juicio oral. Posible disolución del Jurado: sus causas. El veredicto: escrito con el objeto del veredicto; instrucción a los jurados; deliberación y votación; acta; posible devolución del acta. Sentencia. Régimen de recursos.
Tema 32. El procedimiento por delitos leves. Competencia. Ámbito de aplicación. Ejercicio del principio de oportunidad por el Ministerio Fiscal (art. 963.1 LECrim.). Los supuestos de enjuiciamiento rápido ante el Juzgado de Guardia. Régimen ordinario. Celebración del juicio. Sentencia y su impugnación. Breve referencia a los procesos penales especiales: el proceso contra Senadores y Diputados; los procesos por injurias y calumnias contra particulares; los procesos sobre delitos cometidos por medio de la imprenta y otros medios de publicación.
Tema 33. La tutela judicial ante las Secciones de violencia sobre la mujer. Especialidades procesales, especial referencia a la obligación de denunciar y dispensa a declarar. Pérdida de la competencia objetiva de las secciones civiles cuando se produzcan actos de violencia sobre la mujer. Medidas judiciales de protección y de seguridad de las víctimas: la orden de protección y la orden europea de protección.
Tema 34. El procedimiento en la Ley Orgánica 5/2000, de 12 de enero, de Responsabilidad Penal del Menor. Principios reguladores. La Directiva 2016/800, de 11 de mayo. Las fases del procedimiento. Sentencia y régimen de recursos. Principios generales en la ejecución de las medidas.
Tema 35. Régimen general de recursos en el proceso penal. Sucinta exposición de los recursos contra las resoluciones de los Letrados de la Administración de Justicia. Los recursos contra las resoluciones de los Jueces y Tribunales: los recursos no devolutivos: reforma y súplica. El recurso de apelación en el proceso ordinario y en el procedimiento abreviado establecido contra las resoluciones interlocutorias. El recurso de queja contra la inadmisión de otro recurso y como sustitutivo de la apelación.
Tema 36. El recurso de casación penal. Resoluciones recurribles, motivos, admisión y sustanciación. La revisión penal. El recurso de anulación de la sentencia dictada contra reos ausentes.
Tema 37. La ejecución de sentencias penales. Los Tribunales sentenciadores; Secciones de Vigilancia Penitenciaria y Administración Penitenciaria: sus respectivas funciones. Recursos contra las resoluciones de la Administración Penitenciaria y de las Secciones de Vigilancia Penitenciaria.
Tema 38. La cooperación judicial penal internacional. Instrumentos bilaterales y multilaterales de cooperación judicial penal. El Estatuto de Roma y la Corte Penal Internacional. Cooperación judicial penal en el marco del Consejo de Europa: el convenio de Asistencia Judicial Penal de 1959 y el Convenio Europeo de Extradición.
Tema 39. La cooperación judicial penal en la Unión Europea. El principio de reconocimiento mutuo y su desarrollo. Eurojust. Equipos Conjuntos de Investigación. La orden europea de detención y entrega. La orden europea de investigación (Ley 3/2018, de 11 de junio): emisión, transmisión, reconocimiento y ejecución. Garantías procesales.
Tema 40. La Fiscalía Europea, especial referencia al Fiscal Europeo Delegado. Competencia, atribuciones, actuaciones investigadoras. Especialidades procedimentales. Conclusión de la fase de investigación y fase intermedia. Régimen transitorio.

### SUBJECT: mercantil
### NAME: Derecho Mercantil
### COLOR: bg-amber-500
### ACTIVE_CLASS: bg-amber-100 text-amber-800 ring-1 ring-amber-500

Tema 1. El Derecho Mercantil: concepto, caracteres y contenido. El acto de comercio: concepto y clases. El sistema de fuentes del Derecho Mercantil. El Código de Comercio y la legislación complementaria. Otras fuentes del Derecho Mercantil. Relevancia de las normas de Derecho de la Unión Europea.
Tema 2. La contabilidad mercantil. Los libros de comercio: clases y requisitos. Exhibición y fuerza probatoria de los libros de comercio. Las cuentas anuales: su formulación y la aportación al Registro Mercantil. La auditoría de cuentas.
Tema 3. La sociedad mercantil: concepto, naturaleza, caracteres y clases. El objeto social. Constitución e inscripción de la sociedad mercantil; régimen del Registro Mercantil. Sociedades mercantiles irregulares y sociedades civiles con forma mercantil.
Tema 4. Constitución de las sociedades de capital: escritura, estatutos, inscripción, denominación, nacionalidad, domicilio y objeto social. Procedimientos de fundación. Aportaciones sociales: aportaciones dinerarias y aportaciones no dinerarias. Valoración de las aportaciones no dinerarias. Responsabilidad por las aportaciones no dinerarias. El desembolso. Las prestaciones accesorias.
Tema 5. Participaciones sociales y acciones. Los derechos del socio. El libro registro de socios y el régimen de transmisión de las participaciones de las sociedades de responsabilidad limitada. La representación y transmisión de las acciones. Copropiedad y derechos reales sobre participaciones sociales o acciones. Negocios sobre las propias participaciones o acciones.
Tema 6. La Junta General. Competencia. Clases. Convocatoria. Junta Universal. Impugnación de acuerdos. La administración de la sociedad. Representación y deberes. El Consejo de administración: Régimen de funcionamiento. El administrador de hecho.
Tema 7. Modificaciones estatutarias. El aumento de capital social: concepto, modalidades y ejecución. El derecho de suscripción preferente. La reducción de capital social: Concepto, modalidades y requisitos. Reducción y aumento simultáneos.
Tema 8. La separación de socios. La exclusión de socios. La disolución: concepto y causas. Acuerdos de disolución. La liquidación. El liquidador: nombramiento y estatuto del liquidador.
Tema 9. Las modificaciones estructurales de las sociedades tras la modificación operada por el Real Decreto-ley 5/2023, de 28 de junio. Protección de los socios y los acreedores. Transformación. Fusión. Escisión.
Tema 10. Las sociedades cooperativas: concepto, naturaleza y régimen jurídico.
Tema 11. La propiedad industrial y los signos distintivos de la empresa, con referencia al régimen de la Unión Europea. La propiedad intelectual. El contrato de edición.
Tema 12. Los títulos valores: concepto, naturaleza jurídica, caracteres y clases. La letra de cambio. El cheque. El pagaré.
Tema 13. La compraventa mercantil: concepto y régimen jurídico. El riesgo. Compraventas mercantiles especiales. La venta a plazos de bienes muebles.
Tema 14. El contrato de comisión y el afianzamiento mercantil. El contrato de agencia. El contrato de concesión comercial. Los contratos publicitarios. El leasing y el factoring. Referencia al contrato de franquicia.
Tema 15. El contrato de seguro: concepto, caracteres y clases. Elementos. Seguro contra daños: tipos de seguros y obligaciones de las partes. Extinción del contrato.
Tema 16. Seguro de personas. El seguro de vida. Especial referencia al beneficiario del seguro de vida. El reaseguro.
Tema 17. Expedientes de jurisdicción voluntaria en materia mercantil: Exhibición de libros de las personas obligadas a llevar contabilidad, la convocatoria de juntas generales, nombramiento y revocación de liquidador, auditor o interventor de una entidad, reducción de capital social y de la amortización o enajenación de las participaciones o acciones. Disolución judicial de sociedades. Convocatoria general de obligacionistas. Robo, hurto, extravío o destrucción de título valor o representación de partes de socio. Nombramiento de perito en los contratos de seguro.

### SUBJECT: administrativo-laboral
### NAME: Derecho Administrativo y Laboral
### COLOR: bg-orange-500
### ACTIVE_CLASS: bg-orange-100 text-orange-800 ring-1 ring-orange-500

Tema 1. Administración Pública y Derecho. Sistemas de sometimiento de la Administración: el sistema anglosajón y el sistema continental. Singularidades del sistema español. La posición de la Administración ante los Tribunales: especial referencia a sus privilegios procesales. El principio de autotutela. Los interdictos y la Administración. Los conflictos jurisdiccionales.
Tema 2. El sistema de fuentes del Derecho Administrativo. El Reglamento. Relaciones entre Ley y Reglamento. Reserva de ley, competencia y jerarquía normativa. El principio de inderogabilidad singular. Circulares e instrucciones: su valor. Otras fuentes del Derecho Administrativo: la costumbre y el precedente administrativo. Los principios generales del Derecho.
Tema 3. Las Administraciones Públicas I. El régimen jurídico del Sector Público: La personalidad jurídica de las Administraciones Públicas. Tipología de los entes públicos. Teoría de la organización administrativa. Principios de las relaciones entre las Administraciones Públicas.
Tema 4. Las Administraciones Públicas II. La Administración General del Estado. La Administración de las Comunidades Autónomas. La Administración Local. El Sector Público Institucional. Organismos autónomos y entidades públicas empresariales. Las Agencias. Las Autoridades independientes. La Administración Corporativa. La Administración Consultiva: el Consejo de Estado y los órganos consultivos de las Comunidades Autónomas. Las Administraciones Independientes.
Tema 5. La Función Pública. Régimen legal. Los empleados públicos. Naturaleza y contenido de la relación funcionarial. Derechos y deberes de los funcionarios. Adquisición y pérdida de la condición de funcionario. Situaciones administrativas. Responsabilidad de los funcionarios. Conciliación de la vida laboral y familiar. Ordenación del tiempo de trabajo por razón de violencia de género.
Tema 6. El principio de legalidad en la actuación de la Administración. Las potestades administrativas. Actividad reglada. Actividad discrecional. Conceptos jurídicos indeterminados. Los límites de la discrecionalidad y su control jurisdiccional. Especial consideración de la desviación de poder.
Tema 7. La actuación jurídica de la Administración: pública y privada. El acto administrativo: concepto, elementos, forma, motivación, notificación y publicación. Clasificación de los actos administrativos. La obligación de resolver y el silencio administrativo. Inactividad de la Administración. Eficacia y validez de los actos administrativos: nulidad, anulabilidad e irregularidades no invalidantes. La revocación de los actos y su revisión de oficio.
Tema 8. El procedimiento administrativo común: regulación legal y principios generales. Los interesados y la lengua en el procedimiento. Iniciación, ordenación e instrucción del procedimiento. Modos de terminación del procedimiento. Los recursos administrativos: actos recurribles, competencia y procedimiento.
Tema 9. Los contratos del sector público: ámbito de aplicación de la Ley de Contratos del Sector Público. Contratos sujetos a regulación armonizada. Régimen jurídico de los contratos administrativos y los de derecho privado; los actos separables. Disposiciones comunes a los contratos del sector público; especial referencia al régimen de invalidez de los contratos y al recurso especial en materia de contratación. Prerrogativas de derecho público en la contratación administrativa.
Tema 10. Patrimonio de las Administraciones Públicas: concepto, clasificación y régimen jurídico. Los principios relativos a los bienes y derechos de dominio público. Los bienes patrimoniales de la Administración: especial referencia a la Sentencia del Tribunal Constitucional n.º 166/1998, de 15 de julio. La expropiación forzosa: principios reguladores, procedimiento y garantías jurisdiccionales.
Tema 11. La responsabilidad patrimonial de las Administraciones. Fundamento y requisitos. Responsabilidad por el funcionamiento normal o anormal de los servicios públicos. Responsabilidad del Estado por funcionamiento de la Administración de Justicia. Responsabilidad del Estado-legislador.
Tema 12. Urbanismo y Derecho. Ordenación del territorio y ordenación urbanística. Contenido del derecho de la propiedad del suelo: facultades, deberes y cargas. Bases del Régimen del Suelo: Situaciones básicas del suelo y Actuaciones de Transformación Urbanística. Los planes de ordenación. Iniciativa en la urbanización. Régimen de Valoraciones. Disciplina urbanística.
Tema 13. El proceso contencioso-administrativo. Naturaleza, extensión y límites de la jurisdicción contencioso-administrativa. El objeto del proceso: actividad impugnable. Examen del proceso contencioso-administrativo ordinario. Breve referencia al procedimiento abreviado y a los procedimientos especiales. Las medidas cautelares.
Tema 14. La sentencia. Ejecución provisional y definitiva de sentencias. La extensión de los efectos de la sentencia a terceros. Recursos contra providencias y autos. Recurso ordinario de apelación. Recurso de casación y el interés casacional objetivo. Recurso de queja. Recurso de revisión.
Tema 15. Derecho del Trabajo. Concepto y fines. Sistema de fuentes. La constitucionalización del Derecho del Trabajo. La aplicación de las normas laborales. Derecho Social de la Unión Europea. El principio de igualdad y tutela en el ámbito laboral.
Tema 16. Convenios colectivos. La fuerza vinculante de los convenios. Convenios estatutarios y extraestatutarios. Acuerdos de empresa. Aplicación de los convenios y el principio de globalidad. Vigencia temporal y denuncia. Concurrencia de convenios. Planes de Igualdad.
Tema 17. El contrato de trabajo. Notas definitorias. Relación laboral común y relaciones laborales especiales. El trabajo de los menores. Régimen jurídico de las personas trabajadoras extranjeras. Conciliación de la vida laboral y familiar.
Tema 18. Modalidades de contrato laboral. Contrato indefinido, contratos temporales, formativos, a distancia: el teletrabajo, a tiempo parcial, fijo discontinuo y de relevo. Fomento del empleo de las personas con discapacidad.
Tema 19. Prestaciones de las personas trabajadoras. Derechos y deberes. Clasificación profesional. La efectividad del principio de igualdad y la prohibición de discriminación directa e indirecta. Vacaciones, descansos y permisos. Prestación del trabajo, jornada y horario. Ordenación del tiempo de trabajo cuando se trate de personas trabajadoras que tengan la consideración de víctimas de violencia de género.
Tema 20. Prestaciones de la empresa. Ocupación efectiva. Salario y garantías salariales, con especial mención a la igualdad retributiva entre mujeres y hombres. El Fondo de Garantía Salarial. Obligaciones de Seguridad Social y prevención de riesgos laborales. Obligaciones y responsabilidades en el sistema de trabajo por contratas. La protección de la mujer embarazada.
Tema 21. Vicisitudes de la relación laboral: movilidad funcional, movilidad geográfica, modificación sustancial de las condiciones de trabajo, sucesión de empresa, suspensión del contrato de trabajo y excedencias. Tratamiento de la movilidad geográfica y de la suspensión del contrato para las personas trabajadoras que tengan la consideración de víctimas de violencia de género.
Tema 22. La extinción del contrato de trabajo. Despido disciplinario. Despido colectivo. Extinción por causas objetivas, especial referencia a las faltas de asistencia al trabajo en los casos de las personas trabajadoras víctimas de violencia de género. Especial consideración de la nulidad del despido en los casos de personas trabajadoras que tengan la consideración de víctimas de violencia de género. Extinción por voluntad de la persona trabajadora: menoscabo de la dignidad de la persona trabajadora, acoso sexual y por razón de sexo, supuestos de violencia de género.
Tema 23. Los sindicatos. Derecho de libertad sindical. La mayor representatividad sindical. Tutela de la libertad sindical. La representación de las personas trabajadoras en la empresa. Comité de empresa y delegados de personal. Secciones y delegados sindicales.
Tema 24. Conflictos colectivos: formalización y resolución. El derecho de huelga. El cierre empresarial. Otras formas de conflicto colectivo.
Tema 25. Concepto y principios de la Seguridad Social. La acción protectora: concepto y contenido. La enfermedad y el accidente ante la Seguridad Social. Incapacidad temporal, incapacidad permanente y sus grados. Nacimiento y cuidado del menor. Riesgo durante el embarazo y la lactancia, corresponsabilidad en el cuidado de hijos menores y familiares dependientes. Jubilación. Viudedad y orfandad. Protección de los desempleados.
Tema 26. La Seguridad Social en materia de violencia de género. La cotización en los supuestos de suspensión con reserva al puesto de trabajo. El desempleo: situación legal, determinación del período de ocupación cotizada y compromiso de actividad. Pensión de viudedad en supuestos de separación, divorcio y nulidad matrimonial. Prestación de orfandad y compatibilidades. Prestaciones de muerte y supervivencia: concepto, impedimentos y suspensión cautelar. Incremento de las pensiones de orfandad y a favor de familiares.
Tema 27. El proceso laboral. Principios y especialidades. Distribución de competencia entre los órganos jurisdiccionales sociales. Conciliación o mediación previa, agotamiento de la vía administrativa previa y reclamación previa. Demanda, conciliación intraprocesal y acto de juicio. La sentencia en el proceso laboral.
Tema 28. El proceso laboral ordinario y las modalidades procesales. Especial referencia a las modalidades relativas de la tutela de los derechos fundamentales y libertades públicas y a la de los derechos de conciliación de la vida personal, familiar y laboral reconocidos legal o convencionalmente y ejercicio de los derechos de la persona trabajadora víctima de violencia de género; medidas cautelares. Régimen de recursos. La ejecución laboral.
"""

def extract_concise_title(full_text):
    # Take first sentence or first 70-80 chars at a clean boundary
    sentences = re.split(r'\.\s+', full_text.strip())
    first = sentences[0].strip()
    if len(first) > 85:
        # truncate at sensible comma or semicolon if present
        parts = re.split(r'[,;:]\s+', first)
        accum = parts[0]
        for p in parts[1:]:
            if len(accum + ', ' + p) <= 85:
                accum += ', ' + p
            else:
                break
        return accum
    return first

subjects = []
all_topics = []

current_subj = None

lines = raw_data.strip().split('\n')
for line in lines:
    line = line.strip()
    if not line:
        continue
    if line.startswith('### SUBJECT:'):
        s_id = line.replace('### SUBJECT:', '').strip()
        current_subj = {'id': s_id, 'topics': []}
        subjects.append(current_subj)
    elif line.startswith('### NAME:'):
        current_subj['name'] = line.replace('### NAME:', '').strip()
    elif line.startswith('### COLOR:'):
        current_subj['color'] = line.replace('### COLOR:', '').strip()
    elif line.startswith('### ACTIVE_CLASS:'):
        current_subj['activeClass'] = line.replace('### ACTIVE_CLASS:', '').strip()
    elif line.startswith('Tema '):
        m = re.match(r'Tema\s+(\d+)\.\s+(.*)', line)
        if m:
            num = int(m.group(1))
            full_title = m.group(2).strip()
            concise_title = extract_concise_title(full_title)
            topic_obj = {
                'id': f"{current_subj['id']}-{num}",
                'subjectId': current_subj['id'],
                'number': num,
                'title': concise_title,
                'fullTitle': full_title,
                'pages': 0,
                'difficulty': 0,
                'tiempoEstudioHoras': 0,
                'fechaPrimerEstudio': '',
                'fechasRepasos': [],
                'mejorTiempoCantoMinutos': 0,
                'mejorTiempoCantoSegundos': 0,
                'notas': ''
            }
            current_subj['topics'].append(topic_obj)
            all_topics.append(topic_obj)

for s in subjects:
    s['totalTopics'] = len(s['topics'])
    print(f"Subject {s['id']}: {s['name']} -> {s['totalTopics']} topics")

print(f"Total topics: {len(all_topics)}")

# Write to src/data/initialData.ts
ts_subjects = []
for s in subjects:
    ts_subjects.append({
        'id': s['id'],
        'name': s['name'],
        'color': s['color'],
        'activeClass': s['activeClass'],
        'totalTopics': s['totalTopics']
    })

output_ts = f"""import {{ Subject, Topic }} from '../types';

export const initialSubjects: Subject[] = {json.dumps(ts_subjects, indent=2, ensure_ascii=False)};

export const initialTopics: Topic[] = {json.dumps(all_topics, indent=2, ensure_ascii=False)};
"""

with open('src/data/initialData.ts', 'w', encoding='utf-8') as f:
    f.write(output_ts)

print("Successfully written src/data/initialData.ts")
