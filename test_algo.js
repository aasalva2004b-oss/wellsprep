const decayBase = [0.75, 0.60, 0.45, 0.35, 0.25, 0.20, 0.15, 0.10];

function getDecay(vueltaIndex, difficulty) {
   let decay = decayBase[Math.min(vueltaIndex, decayBase.length - 1)];
   // If difficulty is high (e.g. 8-10), decay is slower (larger multiplier)
   // If difficulty is low (e.g. 1-3), decay is faster (smaller multiplier)
   const diffFactor = 1 + ((difficulty - 5) * 0.05); // diff 10 => +25%, diff 1 => -20%
   return Math.min(0.95, decay * diffFactor);
}

const totalHours = 4;
const vueltas = 1;
const difficulty = 8;
let sumDecay = 1;
for (let i = 1; i < vueltas; i++) {
   sumDecay += getDecay(i - 1, difficulty);
}
const initial = totalHours / sumDecay;
console.log("Initial:", initial, "Next Repaso:", initial * getDecay(vueltas - 1, difficulty));
