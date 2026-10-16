const fs = require('fs');
let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

const baseTooltip = `contentStyle={{ borderRadius: '16px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.08)', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }}`;
const areaTooltip = `<Tooltip 
                                      formatter={(value: any) => [\`\${value}/10\`, 'Dificultad']}
                                      cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                                      ${baseTooltip}
                                    />`;

code = code.replace(/<Tooltip \s*formatter=\{\(value: any\) => \[`\$\{value\}\/10`, 'Dificultad'\]\}\s*contentStyle=\{\{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb\(0 0 0 \/ 0.1\)', fontWeight: 'bold' \}\}\s*\/>/s, areaTooltip);

const gridOld = `<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />`;
const gridNew = `<CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />`;
code = code.replaceAll(gridOld, gridNew);

const barTooltipOld = `<Tooltip 
                                      cursor={{fill: '#f8fafc'}}
                                      formatter={(value: any, name: string) => {
                                         if (name === "duracion") return [\`\${value} h\`, 'Duración'];
                                         if (name === "pace") return [\`\${value} m/pág\`, 'Ritmo'];
                                         return [value, name];
                                      }}
                                    />`;
const barTooltipNew = `<Tooltip 
                                      cursor={{fill: 'rgba(241, 245, 249, 0.5)'}}
                                      ${baseTooltip}
                                      formatter={(value: any, name: string) => {
                                         if (name === "duracion") return [\`\${value} h\`, 'Duración'];
                                         if (name === "pace") return [\`\${value} m/pág\`, 'Ritmo'];
                                         return [value, name];
                                      }}
                                    />`;
code = code.replace(barTooltipOld, barTooltipNew);

const cantoTooltipOld = `<Tooltip 
                                      cursor={{fill: '#f8fafc'}}
                                      formatter={(value: any, name: any, props: any) => {
                                        if (name === "duracion") {
                                          return [\`\${value} min\`, 'Canto'];
                                        }
                                        if (name === "nota") {
                                          return [\`\${value}/10\`, 'Nota'];
                                        }
                                        return [value, name];
                                      }}
                                    />`;
const cantoTooltipNew = `<Tooltip 
                                      cursor={{fill: 'rgba(241, 245, 249, 0.5)'}}
                                      ${baseTooltip}
                                      formatter={(value: any, name: any, props: any) => {
                                        if (name === "duracion") {
                                          return [\`\${value} min\`, 'Canto'];
                                        }
                                        if (name === "nota") {
                                          return [\`\${value}/10\`, 'Nota'];
                                        }
                                        return [value, name];
                                      }}
                                    />`;
code = code.replace(cantoTooltipOld, cantoTooltipNew);

fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
