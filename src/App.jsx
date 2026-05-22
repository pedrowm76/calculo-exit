import React, { useState, useMemo } from 'react';
import { 
  Calculator, PieChart, TrendingUp, DollarSign, 
  AlertTriangle, Copy, CheckCircle, Info, ChevronRight, 
  Briefcase, Target, Trash2, Plus, HelpCircle, ShieldAlert,
  Percent, ShieldCheck, ArrowUpRight
} from 'lucide-react';

// --- UTILS & FORMATTERS ---
const formatCurrency = (value) => {
  const num = Number(value);
  if (isNaN(num)) return 'R$ 0';
  if (Math.abs(num) >= 1000000) {
    return `R$ ${(num / 1000000).toFixed(2).replace('.', ',')}M`;
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(num);
};

const formatPercent = (value) => {
  const num = Number(value);
  if (isNaN(num)) return '0%';
  return `${num.toFixed(2).replace('.', ',')}%`;
};

// Progressive Capital Gains Tax for Brazilian Physical Person (PF)
const calculateBRTax = (gain) => {
  if (gain <= 0) return 0;
  let tax = 0;
  if (gain <= 5000000) return gain * 0.15;
  tax += 5000000 * 0.15;
  if (gain <= 10000000) return tax + (gain - 5000000) * 0.175;
  tax += 5000000 * 0.175;
  if (gain <= 30000000) return tax + (gain - 10000000) * 0.20;
  tax += 20000000 * 0.20;
  return tax + (gain - 30000000) * 0.225;
};

// Tooltip Component
function Tooltip({ content }) {
  return (
    <span className="group relative inline-block ml-1 cursor-pointer align-middle">
      <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-indigo-600 transition-colors" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-lg bg-slate-900 p-2.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 leading-normal font-normal">
        {content}
        <span className="absolute top-full left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1 bg-slate-900 rotate-45"></span>
      </span>
    </span>
  );
}

// Core Waterfall Allocation Engine (Corrected)
const allocatePool = (poolAmount, table) => {
  const eqValue = Math.max(0, poolAmount);
  const payouts = {};
  table.forEach(p => { payouts[p.id] = 0; });

  // Calculate nominal preferences
  const prefGoals = {};
  let totalPrefGoals = 0;
  table.forEach(p => {
    const prefAmount = Number(p.prefAmount) || 0;
    const prefMultiple = Number(p.prefMultiple) || 0;
    const goal = p.hasPref ? prefAmount * prefMultiple : 0;
    prefGoals[p.id] = goal;
    totalPrefGoals += goal;
  });

  // If pool does not cover preferences, distribute pro-rata to preferred holders
  if (eqValue <= totalPrefGoals) {
    if (totalPrefGoals > 0) {
      table.forEach(p => {
        payouts[p.id] = eqValue * (prefGoals[p.id] / totalPrefGoals);
      });
    } else {
      // No preferences at all, distribute by raw ownership
      table.forEach(p => {
        payouts[p.id] = eqValue * ((Number(p.ownership) || 0) / 100);
      });
    }
    return payouts;
  }

  // If pool exceeds total preferences, determine stable conversion set for non-participating preferreds
  // Common holders and participating preferreds are always in the active equity pool
  let pActive = table.filter(p => !p.hasPref || (p.hasPref && p.isParticipating));
  let pKeep = table.filter(p => p.hasPref && !p.isParticipating);

  let iterations = 0;
  while (iterations < 50) { // Safety guard
    iterations++;
    const currentPayouts = {};
    let spentOnPrefs = 0;

    // Non-participating preferreds who keep preference get exactly their preference goal
    pKeep.forEach(p => {
      currentPayouts[p.id] = prefGoals[p.id];
      spentOnPrefs += prefGoals[p.id];
    });

    // Participating preferreds get their preference first
    pActive.forEach(p => {
      if (p.hasPref && p.isParticipating) {
        currentPayouts[p.id] = prefGoals[p.id];
        spentOnPrefs += prefGoals[p.id];
      } else {
        currentPayouts[p.id] = 0;
      }
    });

    const remainingPool = Math.max(0, eqValue - spentOnPrefs);
    const totalActiveOwnership = pActive.reduce((sum, p) => sum + (Number(p.ownership) || 0), 0);

    // Share remaining pool pro-rata among active participants
    pActive.forEach(p => {
      const share = totalActiveOwnership > 0 ? remainingPool * ((Number(p.ownership) || 0) / totalActiveOwnership) : 0;
      currentPayouts[p.id] += share;
    });

    // Check if any non-participating preferred investor would get more by converting
    let candidateToConvert = null;
    let maxGain = 0;

    for (let i = 0; i < pKeep.length; i++) {
      const p = pKeep[i];
      // Simulate conversion
      const simActive = [...pActive, p];
      const simKeep = pKeep.filter(k => k.id !== p.id);

      let simSpentOnPrefs = 0;
      simKeep.forEach(k => { simSpentOnPrefs += prefGoals[k.id]; });
      simActive.forEach(a => {
        if (a.hasPref && a.isParticipating) {
          simSpentOnPrefs += prefGoals[a.id];
        }
      });
      const simRemainingPool = Math.max(0, eqValue - simSpentOnPrefs);
      const simTotalActiveOwnership = simActive.reduce((sum, a) => sum + (Number(a.ownership) || 0), 0);
      const simPayoutIfConvert = simTotalActiveOwnership > 0 ? simRemainingPool * ((Number(p.ownership) || 0) / simTotalActiveOwnership) : 0;

      if (simPayoutIfConvert > currentPayouts[p.id]) {
        const gain = simPayoutIfConvert - currentPayouts[p.id];
        if (gain > maxGain) {
          maxGain = gain;
          candidateToConvert = p;
        }
      }
    }

    if (candidateToConvert) {
      pActive.push(candidateToConvert);
      pKeep = pKeep.filter(k => k.id !== candidateToConvert.id);
    } else {
      Object.assign(payouts, currentPayouts);
      break;
    }
  }

  return payouts;
};

export default function App() {
  const [activeTab, setActiveTab] = useState('captable');
  const [copied, setCopied] = useState(false);
  const [waterfallScenario, setWaterfallScenario] = useState('withSec'); // 'noSec' or 'withSec'

  // --- STATE: CAP TABLE ---
  const [capTable, setCapTable] = useState([
    { id: 1, name: 'Founder A (Principal)', category: 'Founder', ownership: '42', cost: '100000', hasPref: false, prefAmount: '0', prefMultiple: '1', isParticipating: false, isMainFounder: true },
    { id: 2, name: 'Founder B', category: 'Founder', ownership: '38', cost: '80000', hasPref: false, prefAmount: '0', prefMultiple: '1', isParticipating: false, isMainFounder: false },
    { id: 3, name: 'Investidor Anjo', category: 'Investidor', ownership: '15', cost: '1500000', hasPref: true, prefAmount: '1500000', prefMultiple: '1', isParticipating: false, isMainFounder: false },
    { id: 4, name: 'ESOP / Pool', category: 'Pool', ownership: '5', cost: '0', hasPref: false, prefAmount: '0', prefMultiple: '1', isParticipating: false, isMainFounder: false }
  ]);

  // --- STATE: COMPANY FINANCE & PROJECTIONS ---
  const [company, setCompany] = useState({
    name: 'Empresa XYZ',
    companyType: 'SaaS',
    revenue: '15000000',
    arr: '12000000',
    ebitda: '1500000',
    cash: '2000000',
    debt: '1000000',
    valMetric: 'ARR', // 'Revenue', 'ARR', 'EBITDA', 'Manual'
    currentMultiple: '4',
    manualValuation: '48000000',
    projectionYears: '5',
    growthRate: '20', // % a.a. (Organic)
    targetEbitdaMargin: '18', // %
    exitMultiple: '6',
    manualExitValuationOrg: '', // Optional Manual Exit EV
    safeYieldRate: '10.5', // CDI Rate %
    futureCash: '3000000',
    futureDebt: '2000000'
  });

  // --- STATE: SCENARIOS PARAMETERS ---
  const [scenarios, setScenarios] = useState({
    upfrontPercent: '80',
    earnoutPercent: '20',
    earnoutProbability: '60',
    fundraising: {
      newGrowthRate: '35', // % post-raise
      manualExitValuation: '', // Optional Manual Exit EV (Fundraised)
      rounds: [
        { id: 'A', name: 'Série A', active: true, amount: '10000000', preMoney: '40000000', optionPoolIncrease: '5', prefMultiple: '1', isParticipating: false, secondaryPercent: '10' },
        { id: 'B', name: 'Série B', active: false, amount: '25000000', preMoney: '100000000', optionPoolIncrease: '5', prefMultiple: '1', isParticipating: false, secondaryPercent: '0' },
        { id: 'C', name: 'Série C', active: false, amount: '50000000', preMoney: '250000000', optionPoolIncrease: '5', prefMultiple: '1', isParticipating: false, secondaryPercent: '0' }
      ]
    },
    dividends: {
      distributePercentage: '30' // % of EBITDA
    }
  });

  // --- STATE: RISK DISCOUNTS ---
  const [riskDiscounts, setRiskDiscounts] = useState({
    organic: '25',      // 25% risk for execution without capital
    fundraising: '40',  // 40% risk for aggressive fundraising exit target
    dividends: '20'     // 20% risk for organic + dividend distribution
  });

  // --- CAP TABLE ACTIONS ---
  const totalOwnership = capTable.reduce((sum, p) => sum + (Number(p.ownership) || 0), 0);
  const isCapTableValid = Math.abs(totalOwnership - 100) < 0.01;
  const mainFounder = capTable.find(p => p.isMainFounder) || capTable[0];

  const handleAddShareholder = () => {
    const newId = capTable.length > 0 ? Math.max(...capTable.map(p => p.id)) + 1 : 1;
    setCapTable([
      ...capTable,
      { id: newId, name: `Novo Acionista ${newId}`, category: 'Outros', ownership: '0', cost: '0', hasPref: false, prefAmount: '0', prefMultiple: '1', isParticipating: false, isMainFounder: false }
    ]);
  };

  const handleRemoveShareholder = (id) => {
    const itemToRemove = capTable.find(p => p.id === id);
    let newTable = capTable.filter(p => p.id !== id);
    
    // If we removed the main founder, re-assign it to the first available row
    if (itemToRemove?.isMainFounder && newTable.length > 0) {
      newTable[0].isMainFounder = true;
    }
    setCapTable(newTable);
  };

  const handleNormalizeCapTable = () => {
    const sum = capTable.reduce((s, p) => s + (Number(p.ownership) || 0), 0);
    if (sum === 0) return;
    const newTable = capTable.map(p => ({
      ...p,
      ownership: (((Number(p.ownership) || 0) / sum) * 100).toFixed(2).replace(',', '.')
    }));
    setCapTable(newTable);
  };

  const updateCapTable = (index, field, value) => {
    const newCT = [...capTable];
    newCT[index][field] = value;
    setCapTable(newCT);
  };

  const updateRound = (roundId, field, value) => {
    const newRounds = scenarios.fundraising.rounds.map(r => 
      r.id === roundId ? { ...r, [field]: value } : r
    );
    setScenarios({ 
      ...scenarios, 
      fundraising: { ...scenarios.fundraising, rounds: newRounds } 
    });
  };

  // --- CALCULATION ENGINE ---
  const results = useMemo(() => {
    if (!isCapTableValid) return null;

    // Parse company values
    const pYears = Number(company.projectionYears) || 0;
    const currentRev = Number(company.revenue) || 0;
    const currentArr = Number(company.arr) || 0;
    const currentEbitda = Number(company.ebitda) || 0;
    const currentCash = Number(company.cash) || 0;
    const currentDebt = Number(company.debt) || 0;
    const futureCash = Number(company.futureCash) || 0;
    const futureDebt = Number(company.futureDebt) || 0;
    const exitMultiple = Number(company.exitMultiple) || 0;
    
    // 1. Current Valuation (Venda Hoje)
    let currentEV = 0;
    if (company.valMetric === 'Manual') {
      currentEV = Number(company.manualValuation) || 0;
    } else {
      const mult = Number(company.currentMultiple) || 0;
      if (company.valMetric === 'Revenue') currentEV = currentRev * mult;
      else if (company.valMetric === 'ARR') currentEV = currentArr * mult;
      else if (company.valMetric === 'EBITDA') currentEV = currentEbitda * mult;
    }
    const currentEquityValue = currentEV + currentCash - currentDebt;

    // 2. Organic Future Valuation (5 Years)
    const orgGrowth = Number(company.growthRate) || 0;
    const orgRevFinal = currentRev * Math.pow(1 + orgGrowth / 100, pYears);
    const orgArrFinal = currentArr * Math.pow(1 + orgGrowth / 100, pYears);
    const orgEbitdaFinal = orgRevFinal * ((Number(company.targetEbitdaMargin) || 0) / 100);

    let orgFutureEV = 0;
    const manualOrgExitEV = Number(company.manualExitValuationOrg) || 0;
    const isOrgOverride = manualOrgExitEV > 0;

    if (isOrgOverride) {
      orgFutureEV = manualOrgExitEV;
    } else if (company.valMetric === 'Revenue') {
      orgFutureEV = orgRevFinal * exitMultiple;
    } else if (company.valMetric === 'ARR') {
      orgFutureEV = orgArrFinal * exitMultiple;
    } else if (company.valMetric === 'EBITDA') {
      orgFutureEV = orgEbitdaFinal * exitMultiple;
    } else {
      orgFutureEV = currentEV * Math.pow(1 + orgGrowth / 100, pYears);
    }
    const orgFutureEquityValue = orgFutureEV + futureCash - futureDebt;

    // 3. Fundraised Future Valuation
    const fundGrowth = Number(scenarios.fundraising.newGrowthRate) || 0;
    const fundRevFinal = currentRev * Math.pow(1 + fundGrowth / 100, pYears);
    const fundArrFinal = currentArr * Math.pow(1 + fundGrowth / 100, pYears);
    const fundEbitdaFinal = fundRevFinal * ((Number(company.targetEbitdaMargin) || 0) / 100);

    let fundFutureEV = 0;
    const manualFundExitEV = Number(scenarios.fundraising.manualExitValuation) || 0;
    const isFundOverride = manualFundExitEV > 0;

    if (isFundOverride) {
      fundFutureEV = manualFundExitEV;
    } else if (company.valMetric === 'Revenue') {
      fundFutureEV = fundRevFinal * exitMultiple;
    } else if (company.valMetric === 'ARR') {
      fundFutureEV = fundArrFinal * exitMultiple;
    } else if (company.valMetric === 'EBITDA') {
      fundFutureEV = fundEbitdaFinal * exitMultiple;
    } else {
      fundFutureEV = currentEV * Math.pow(1 + fundGrowth / 100, pYears);
    }
    const fundFutureEquityValue = fundFutureEV + futureCash - futureDebt;

    // Process fundraising rounds and founder secondary sales
    const activeRounds = scenarios.fundraising.rounds.filter(r => r.active);
    const processRounds = (applySec) => {
      let tbl = capTable.map(p => ({ ...p, secondaryGross: 0, secondaryTax: 0, secondaryNet: 0 }));
      activeRounds.forEach(round => {
        const roundAmount = Number(round.amount) || 0;
        const roundPreMoney = Number(round.preMoney) || 0;
        const roundPoolIncrease = Number(round.optionPoolIncrease) || 0;
        const roundPrefMult = Number(round.prefMultiple) || 0;
        const roundSecPct = applySec ? (Number(round.secondaryPercent) || 0) : 0;

        // Process secondary sale from main founder in the round
        if (roundSecPct > 0) {
          tbl = tbl.map(p => {
            if (p.isMainFounder) {
              const ownershipStr = Number(p.ownership) || 0;
              const costStr = Number(p.cost) || 0;
              const portionSold = roundSecPct / 100;
              const ownershipSold = ownershipStr * portionSold;
              const grossValue = (ownershipSold / 100) * roundPreMoney;
              const costConsumed = costStr * portionSold;

              const gain = Math.max(0, grossValue - costConsumed);
              const tax = calculateBRTax(gain);
              const netValue = grossValue - tax;

              return {
                ...p,
                ownership: (ownershipStr - ownershipSold).toString(),
                cost: (costStr - costConsumed).toString(),
                secondaryGross: (p.secondaryGross || 0) + grossValue,
                secondaryTax: (p.secondaryTax || 0) + tax,
                secondaryNet: (p.secondaryNet || 0) + netValue
              };
            }
            return p;
          });
        }

        const postMoney = roundPreMoney + roundAmount;
        const newInvestorPct = postMoney > 0 ? (roundAmount / postMoney) * 100 : 0;
        const dilutionFactor = 1 - (newInvestorPct / 100) - (roundPoolIncrease / 100);

        // Dilute existing shareholders
        tbl = tbl.map(p => ({
          ...p,
          ownership: ((Number(p.ownership) || 0) * dilutionFactor).toString()
        }));

        // Add new investor row
        tbl.push({
          id: `new_inv_${round.id}`,
          name: `Investidor ${round.name}`,
          category: 'Investidor',
          ownership: newInvestorPct.toString(),
          cost: roundAmount.toString(),
          hasPref: true,
          prefAmount: roundAmount.toString(),
          prefMultiple: roundPrefMult.toString(),
          isParticipating: round.isParticipating || false,
          isMainFounder: false,
          secondaryGross: 0,
          secondaryTax: 0,
          secondaryNet: 0
        });

        // Add new option pool row
        if (roundPoolIncrease > 0) {
          tbl.push({
            id: `new_pool_${round.id}`,
            name: `Pool (${round.name})`,
            category: 'Pool',
            ownership: roundPoolIncrease.toString(),
            cost: '0',
            hasPref: false,
            prefAmount: '0',
            prefMultiple: '1',
            isParticipating: false,
            isMainFounder: false,
            secondaryGross: 0,
            secondaryTax: 0,
            secondaryNet: 0
          });
        }
      });
      return tbl;
    };

    const postRaiseCapTableNoSec = processRounds(false);
    const postRaiseCapTableWithSec = processRounds(true);

    // 4. Calculate Dividends Pool
    let totalDividendsPool = 0;
    const divDistPct = Number(scenarios.dividends.distributePercentage) || 0;
    for (let i = 1; i <= pYears; i++) {
      const yearRev = currentRev * Math.pow(1 + orgGrowth / 100, i);
      const yearEbitda = yearRev * ((Number(company.targetEbitdaMargin) || 0) / 100);
      if (yearEbitda > 0) {
        totalDividendsPool += yearEbitda * (divDistPct / 100);
      }
    }

    // Scenario runner applying the cumulative waterfall model
    const runScenario = (equityValue, capTableSnapshot, divsPool = 0) => {
      const upPct = Number(scenarios.upfrontPercent) || 0;
      const eoProb = Number(scenarios.earnoutProbability) || 0;

      const totalUpfront = equityValue * (upPct / 100);
      
      // Calculate upfront and total gross payouts
      const upfrontPayouts = allocatePool(totalUpfront, capTableSnapshot);
      const totalPayouts = allocatePool(equityValue, capTableSnapshot);

      return capTableSnapshot.map(p => {
        const ownership = Number(p.ownership) || 0;
        const pct = ownership / 100;

        const upfrontBruto = upfrontPayouts[p.id] || 0;
        const totalBruto = totalPayouts[p.id] || 0;
        const earnoutBruto = Math.max(0, totalBruto - upfrontBruto);
        const earnoutEsperado = earnoutBruto * (eoProb / 100);

        // Dividends
        const divsBruto = divsPool * pct;
        const monthlyDiv = divsBruto / (pYears * 12);
        const divTaxRate = monthlyDiv > 50000 ? 0.10 : 0.00;
        const divsTax = divsBruto * divTaxRate;
        const divsLiquido = divsBruto - divsTax;

        // Taxes upfront
        const cost = Number(p.cost) || 0;
        const upfrontGain = Math.max(0, upfrontBruto - cost);
        const upfrontTax = calculateBRTax(upfrontGain);
        const upfrontLiquido = upfrontBruto - upfrontTax;

        // Taxes earnout (Expected)
        const earnoutTax = calculateBRTax(earnoutEsperado);
        const earnoutLiquido = earnoutEsperado - earnoutTax;

        // Secondary (already computed on row)
        const secondaryGross = p.secondaryGross || 0;
        const secondaryTax = p.secondaryTax || 0;
        const secondaryNet = p.secondaryNet || 0;

        const totalTaxPaid = upfrontTax + earnoutTax + divsTax + secondaryTax;
        const totalLiquido = upfrontLiquido + earnoutLiquido + divsLiquido + secondaryNet;

        return {
          ...p,
          upfrontBruto,
          upfrontTax,
          upfrontLiquido,
          earnoutEsperado,
          earnoutTax,
          earnoutLiquido,
          divsBruto,
          divsTax,
          divsLiquido,
          secondaryGross,
          secondaryTax,
          secondaryNet,
          totalTaxPaid,
          totalLiquido
        };
      });
    };

    // Calculate outcomes
    const resToday = runScenario(currentEquityValue, capTable);
    const resOrg = runScenario(orgFutureEquityValue, capTable);
    const resFundNoSec = runScenario(fundFutureEquityValue, postRaiseCapTableNoSec);
    const resFundWithSec = runScenario(fundFutureEquityValue, postRaiseCapTableWithSec);
    const resDivs = runScenario(orgFutureEquityValue, capTable, totalDividendsPool);

    const fToday = resToday.find(r => r.id === mainFounder.id) || { totalLiquido: 0 };
    const fOrg = resOrg.find(r => r.id === mainFounder.id) || { totalLiquido: 0 };
    const fFundNoSec = resFundNoSec.find(r => r.id === mainFounder.id) || { totalLiquido: 0 };
    const fFundWithSec = resFundWithSec.find(r => r.id === mainFounder.id) || { totalLiquido: 0 };
    const fDivs = resDivs.find(r => r.id === mainFounder.id) || { totalLiquido: 0 };

    // CDI yield on immediate sale
    const safeYield = Number(company.safeYieldRate) || 0;
    const todayYieldedTotal = fToday.totalLiquido * Math.pow(1 + safeYield / 100, pYears);
    const todayYieldedInterest = todayYieldedTotal - fToday.totalLiquido;

    // --- EXACT BREAK-EVEN HURDLE SOLVER ---
    const findEvForTarget = (targetNet, tableSnapshot, divsPool = 0) => {
      let low = 0;
      let high = 5000000000;
      let bestEv = 0;
      for (let i = 0; i < 40; i++) {
        let mid = (low + high) / 2;
        let testEquity = mid + futureCash - futureDebt;
        let res = runScenario(testEquity, tableSnapshot, divsPool);
        let fNet = res.find(r => r.id === mainFounder.id)?.totalLiquido || 0;
        if (fNet < targetNet) {
          low = mid;
        } else {
          high = mid;
          bestEv = mid;
        }
      }
      return bestEv;
    };

    const breakEvenEvOrgCdi = findEvForTarget(todayYieldedTotal, capTable, 0);
    const breakEvenEvFundNoSecCdi = findEvForTarget(todayYieldedTotal, postRaiseCapTableNoSec, 0);
    const breakEvenEvFundWithSecCdi = findEvForTarget(todayYieldedTotal, postRaiseCapTableWithSec, 0);
    const breakEvenEvFundNoSecVsOrg = findEvForTarget(fOrg.totalLiquido, postRaiseCapTableNoSec, 0);
    const breakEvenEvFundWithSecVsOrg = findEvForTarget(fOrg.totalLiquido, postRaiseCapTableWithSec, 0);

    // Build Sensitivity Matrix
    const rawEvPoints = [
      currentEV, 
      breakEvenEvOrgCdi, 
      breakEvenEvFundNoSecCdi, 
      breakEvenEvFundWithSecCdi, 
      breakEvenEvFundNoSecVsOrg, 
      breakEvenEvFundWithSecVsOrg, 
      orgFutureEV, 
      fundFutureEV
    ];
    const sortedEvPoints = [...new Set(rawEvPoints.filter(p => p > 0).map(p => Math.round(p / 10000) * 10000))].sort((a, b) => a - b);
    
    const matrixEvs = [...sortedEvPoints];
    const maxEvPlot = matrixEvs[matrixEvs.length - 1] || currentEV;
    if (maxEvPlot > 0) {
      matrixEvs.push(maxEvPlot * 1.25);
      matrixEvs.push(maxEvPlot * 1.50);
    }
    const finalMatrixEvs = [...new Set(matrixEvs.map(p => Math.round(p / 10000) * 10000))].sort((a, b) => a - b);

    const sensitivityMatrix = finalMatrixEvs.map(ev => {
      let testEquity = ev + futureCash - futureDebt;
      let resOrgMat = runScenario(testEquity, capTable, 0);
      let resFundNoSecMat = runScenario(testEquity, postRaiseCapTableNoSec, 0);
      let resFundWithSecMat = runScenario(testEquity, postRaiseCapTableWithSec, 0);
      let netOrg = resOrgMat.find(r => r.id === mainFounder.id)?.totalLiquido || 0;
      let netFundNoSec = resFundNoSecMat.find(r => r.id === mainFounder.id)?.totalLiquido || 0;
      let netFundWithSec = resFundWithSecMat.find(r => r.id === mainFounder.id)?.totalLiquido || 0;
      
      let winner = 'CDI / Venda Hoje';
      let maxVal = todayYieldedTotal;
      if (netOrg >= maxVal) { winner = 'Orgânico'; maxVal = netOrg; }
      if (netFundNoSec >= maxVal && netFundNoSec > netOrg) { winner = 'Captação S/ Sec'; maxVal = netFundNoSec; }
      if (netFundWithSec >= maxVal && netFundWithSec > netFundNoSec && netFundWithSec > netOrg) { winner = 'Captação C/ Sec'; maxVal = netFundWithSec; }

      return {
        ev,
        netOrg,
        netFundNoSec,
        netFundWithSec,
        winner,
        isCurrentOrg: Math.abs(ev - orgFutureEV) < 50000,
        isCurrentFund: Math.abs(ev - fundFutureEV) < 50000,
        isBreakEvenCdiOrg: Math.abs(ev - breakEvenEvOrgCdi) < 50000,
        isBreakEvenCdiFundNoSec: Math.abs(ev - breakEvenEvFundNoSecCdi) < 50000,
        isBreakEvenCdiFundWithSec: Math.abs(ev - breakEvenEvFundWithSecCdi) < 50000,
      };
    });

    return {
      ev: { today: currentEV, org: orgFutureEV, fund: fundFutureEV },
      eq: { today: currentEquityValue, org: orgFutureEquityValue, fund: fundFutureEquityValue },
      founder: { today: fToday, org: fOrg, fundNoSec: fFundNoSec, fundWithSec: fFundWithSec, divs: fDivs },
      cdi: { total: todayYieldedTotal, interest: todayYieldedInterest },
      breakEvens: { 
        orgCdi: breakEvenEvOrgCdi, 
        fundNoSecCdi: breakEvenEvFundNoSecCdi, 
        fundWithSecCdi: breakEvenEvFundWithSecCdi, 
        fundNoSecOrg: breakEvenEvFundNoSecVsOrg, 
        fundWithSecOrg: breakEvenEvFundWithSecVsOrg 
      },
      sensitivityMatrix,
      activeRoundsCount: activeRounds.length,
      flags: { isOrgOverride, isFundOverride },
      postRaiseCapTableNoSec,
      postRaiseCapTableWithSec,
      pYears,
      totalDividendsPool
    };

  }, [capTable, company, scenarios, isCapTableValid]);

  // --- SLIDE RESUME FORMATTER ---
  const slideText = useMemo(() => {
    if (!results) return '';
    const mainFoundStr = mainFounder.name;
    const orgDisc = Number(riskDiscounts.organic) || 0;
    const fundDisc = Number(riskDiscounts.fundraising) || 0;
    const divsDisc = Number(riskDiscounts.dividends) || 0;

    const netTodayCDI = results.cdi.total;
    const netOrg = results.founder.org.totalLiquido;
    const netOrgRisk = netOrg * (1 - orgDisc / 100);
    const netFundNoSec = results.founder.fundNoSec.totalLiquido;
    const netFundNoSecRisk = netFundNoSec * (1 - fundDisc / 100);
    const netFundWithSec = results.founder.fundWithSec.totalLiquido;
    const netFundWithSecRisk = netFundWithSec * (1 - fundDisc / 100);
    const netDivs = results.founder.divs.totalLiquido;
    const netDivsRisk = netDivs * (1 - divsDisc / 100);

    // Evaluate best scenario based on risk-adjusted values
    let bestScenario = 'Venda Hoje + CDI';
    let bestVal = netTodayCDI;
    if (netOrgRisk > bestVal) { bestScenario = 'Crescimento Orgânico'; bestVal = netOrgRisk; }
    if (netDivsRisk > bestVal) { bestScenario = 'Dividendos + Venda'; bestVal = netDivsRisk; }
    if (netFundNoSecRisk > bestVal) { bestScenario = 'Captação Sem Secundária'; bestVal = netFundNoSecRisk; }
    if (netFundWithSecRisk > bestVal) { bestScenario = 'Captação Com Secundária'; bestVal = netFundWithSecRisk; }

    let recText = '';
    if (bestScenario === 'Venda Hoje + CDI') {
      recText = "Vender hoje é financeiramente a decisão mais racional. O risco de execução futuro (concorrência, mercado) não compensa o prêmio de esperar.";
    } else if (bestScenario === 'Crescimento Orgânico') {
      recText = "Crescer organicamente maximiza o seu retorno esperado. O prêmio de crescimento supera o risco de execução sem sofrer a diluição de uma rodada de captação.";
    } else if (bestScenario === 'Captação Sem Secundária') {
      recText = "A captação sem secundária é recomendada, pois o ganho de crescimento acelerado supera a diluição e a liquidation preference, mesmo aplicando o maior desconto de risco (40%).";
    } else if (bestScenario === 'Captação Com Secundária') {
      recText = "A captação com venda secundária é recomendada, pois você realiza de-risking de liquidez imediata nas rodadas, mantendo um excelente resultado ajustado ao risco.";
    } else {
      recText = "O cenário de dividendos + venda futura é o mais equilibrado, gerando liquidez contínua (de-risking) enquanto sustenta a empresa.";
    }

    return `🎯 RECOMENDAÇÃO ESTRATÉGICA — ${company.name} (${mainFoundStr})

1️⃣ VENDA HOJE + CDI (Risco Zero)
   └ Requisito: Aceitar a oferta atual de EV ${formatCurrency(results.ev.today)}.
   └ Resultado: ${formatCurrency(results.founder.today.totalLiquido)} líquido imediato. No banco a ${company.safeYieldRate}% a.a., vira ${formatCurrency(results.cdi.total)} em ${results.pYears} anos.

2️⃣ CRESCIMENTO ORGÂNICO (Risco ${orgDisc}%)
   └ Requisito: Manter crescimento de ${company.growthRate}% a.a. sem capital. Hurdle: crescer ${(results.ev.org / (results.ev.today || 1)).toFixed(1)}x o EV atual (Saída: ${formatCurrency(results.ev.org)}).
   └ Resultado: Nominal de ${formatCurrency(netOrg)} | Ajustado ao Risco: ${formatCurrency(netOrgRisk)}.

3️⃣ CAPTAÇÃO ACELERADA (Risco ${fundDisc}%)
   └ Requisito: Captar rodada(s) e vender por pelo menos ${formatCurrency(results.ev.fund)}. Hurdle: crescer ${(results.ev.fund / (results.ev.today || 1)).toFixed(1)}x o EV atual.
   A) SEM SECUNDÁRIA:
      ├ Ponto de Empate: Vender acima de ${formatCurrency(results.breakEvens.fundNoSecOrg)} para compensar o cenário Orgânico.
      └ Resultado: Nominal de ${formatCurrency(netFundNoSec)} | Ajustado ao Risco: ${formatCurrency(netFundNoSecRisk)}.
   B) COM SECUNDÁRIA (De-risking em rodadas):
      ├ Ponto de Empate: Vender acima de ${formatCurrency(results.breakEvens.fundWithSecOrg)} para compensar o cenário Orgânico.
      ├ Secundária Antecipada: ${formatCurrency(results.founder.fundWithSec.secondaryNet)} líquidos no bolso.
      └ Resultado: Nominal de ${formatCurrency(netFundWithSec)} | Ajustado ao Risco: ${formatCurrency(netFundWithSecRisk)}.

4️⃣ DIVIDENDOS + VENDA (Risco ${divsDisc}%)
   └ Requisito: Distribuição anual de ${scenarios.dividends.distributePercentage}% do EBITDA e venda orgânica final de EV ${formatCurrency(results.ev.org)}.
   └ Resultado: Nominal de ${formatCurrency(netDivs)} | Ajustado ao Risco: ${formatCurrency(netDivsRisk)} (inclui de-risking em dividendos acumulados).

💡 CONCLUSÃO ADVISORY:
${recText}`;
  }, [results, company, scenarios, riskDiscounts, mainFounder]);

  const handleCopySlide = () => {
    navigator.clipboard.writeText(slideText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderTabButton = (id, label, icon) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-all ${
        activeTab === id 
          ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' 
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 font-sans">
      {/* HEADER */}
      <header className="bg-slate-900 text-white px-6 py-4 flex flex-col md:flex-row justify-between items-center shadow-md border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-600/30">
            <Calculator className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-sans tracking-tight">Founder Outcome Simulator</h1>
            <p className="text-[10px] text-indigo-300 uppercase tracking-widest font-bold">ACE Advisors • V1 Premium</p>
          </div>
        </div>
        {results && (
          <div className="flex gap-6 mt-4 md:mt-0 bg-slate-800/60 p-2.5 px-4 rounded-xl border border-slate-700/60 text-xs">
            <div>
              <span className="text-slate-400 block font-semibold">Empresa</span>
              <span className="font-bold text-white text-sm">{company.name}</span>
            </div>
            <div className="border-l border-slate-700/80 pl-4">
              <span className="text-slate-400 block font-semibold">Métrica Valuation</span>
              <span className="font-bold text-indigo-400 text-sm">
                {company.valMetric === 'Manual' ? 'Manual' : `${company.valMetric} (${company.currentMultiple}x)`}
              </span>
            </div>
            <div className="border-l border-slate-700/80 pl-4">
              <span className="text-slate-400 block font-semibold">Sócio de Referência</span>
              <span className="font-bold text-emerald-400 text-sm">{mainFounder.name}</span>
            </div>
          </div>
        )}
      </header>

      {/* TABS */}
      <div className="bg-white border-b border-slate-200/80 shadow-sm sticky top-0 z-20">
        <nav className="flex max-w-7xl mx-auto overflow-x-auto">
          {renderTabButton('captable', '1. Cap Table Atual', <PieChart className="w-4 h-4" />)}
          {renderTabButton('company', '2. Finanças & Projeções', <TrendingUp className="w-4 h-4" />)}
          {renderTabButton('scenarios', '3. Cenários & Risco', <Briefcase className="w-4 h-4" />)}
          {renderTabButton('results', '4. Resultados & Apresentação', <DollarSign className="w-4 h-4" />)}
        </nav>
      </div>

      {/* CAP TABLE VALIDATION ALERT */}
      {!isCapTableValid && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 max-w-7xl mx-auto mt-6 rounded-r-xl shadow-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-amber-800">Ajuste Necessário no Cap Table</h3>
            <p className="text-xs text-amber-700 mt-0.5">
              A soma das participações atuais está em <span className="font-bold">{totalOwnership.toFixed(2)}%</span>. A calculadora exige **exatos 100%** para rodar os cálculos. Clique no botão de normalizar abaixo para ajustar automaticamente.
            </p>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <main className="p-6 max-w-7xl mx-auto">
        
        {/* --- TAB 1: CAP TABLE --- */}
        {activeTab === 'captable' && (
          <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/60 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  Estrutura Societária Atual (Fully Diluted)
                  <Tooltip content="O cap table deve conter todos os detentores de ações na base fully diluted, incluindo fundadores, investidores atuais e pool de opções (ESOP) ativo." />
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Configure as participações, custos de aquisição (para IR) e direitos de preferência.</p>
              </div>
              <div className="flex gap-2 items-center">
                <span className={`px-3.5 py-1.5 rounded-full text-xs font-bold ${isCapTableValid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  Soma: {totalOwnership.toFixed(2)}%
                </span>
                <button onClick={handleNormalizeCapTable} className="text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3.5 py-2 rounded-lg transition-colors border border-indigo-100">
                  Normalizar para 100%
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100 text-xs">
                    <th className="px-5 py-4">Sócio</th>
                    <th className="px-5 py-4 w-36">Categoria <Tooltip content="Founder: Categoria principal. Investidor: Ativa direitos de Liquidation Preference. Pool: ESOP." /></th>
                    <th className="px-5 py-4 w-28">Partic. %</th>
                    <th className="px-5 py-4 w-36">Custo Aquisição (R$) <Tooltip content="O custo pago pelas ações. Usado para deduzir o ganho de capital e pagar menos imposto no exit." /></th>
                    <th className="px-5 py-4 text-center w-20">Preferencial?</th>
                    <th className="px-5 py-4 w-36">Base Pref (R$) <Tooltip content="Normalmente o valor original investido que serve de base para o waterfall de preferência." /></th>
                    <th className="px-5 py-4 w-20">Mult. <Tooltip content="Múltiplo da Liquidation Preference (ex: 1x, 2x do capital investido)." /></th>
                    <th className="px-5 py-4 text-center w-24">Participante? <Tooltip content="Se sim, o investidor recebe a preferência + sua parte proporcional no saldo restante. Se não (Non-Participating), ele recebe o maior valor entre a preferência ou sua conversão em comum." /></th>
                    <th className="px-5 py-4 text-center w-28">Founder Principal <Tooltip content="O sócio que será o ponto focal de todas as análises e painéis." /></th>
                    <th className="px-5 py-4 text-center w-16">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {capTable.map((p, idx) => (
                    <tr key={p.id} className={`hover:bg-slate-50/50 ${p.isMainFounder ? 'bg-indigo-50/20' : ''}`}>
                      <td className="px-5 py-3">
                        <input type="text" value={p.name} onChange={e => updateCapTable(idx, 'name', e.target.value)} className="w-full bg-transparent font-medium border-b border-transparent focus:border-indigo-500 py-1 outline-none text-slate-900 focus:bg-white" />
                      </td>
                      <td className="px-5 py-3">
                        <select value={p.category} onChange={e => updateCapTable(idx, 'category', e.target.value)} className="w-full bg-transparent border-b border-transparent focus:border-indigo-500 py-1 outline-none focus:bg-white">
                          <option>Founder</option>
                          <option>Investidor</option>
                          <option>Pool</option>
                          <option>Advisor</option>
                          <option>Outros</option>
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <input type="number" step="any" value={p.ownership} onChange={e => updateCapTable(idx, 'ownership', e.target.value)} className="w-full font-bold bg-transparent border-b border-transparent focus:border-indigo-500 py-1 outline-none focus:bg-white" />
                      </td>
                      <td className="px-5 py-3">
                        <input type="number" value={p.cost} onChange={e => updateCapTable(idx, 'cost', e.target.value)} className="w-full bg-transparent border-b border-transparent focus:border-indigo-500 py-1 outline-none focus:bg-white" />
                      </td>
                      <td className="px-5 py-3 text-center">
                        <input type="checkbox" checked={p.hasPref} onChange={e => updateCapTable(idx, 'hasPref', e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                      </td>
                      <td className="px-5 py-3">
                        <input type="number" value={p.prefAmount} disabled={!p.hasPref} onChange={e => updateCapTable(idx, 'prefAmount', e.target.value)} className="w-full bg-transparent border-b border-transparent focus:border-indigo-500 py-1 outline-none disabled:opacity-30 focus:bg-white" />
                      </td>
                      <td className="px-5 py-3">
                        <input type="number" step="0.5" value={p.prefMultiple} disabled={!p.hasPref} onChange={e => updateCapTable(idx, 'prefMultiple', e.target.value)} className="w-full bg-transparent border-b border-transparent focus:border-indigo-500 py-1 outline-none disabled:opacity-30 focus:bg-white" />
                      </td>
                      <td className="px-5 py-3 text-center">
                        <input type="checkbox" checked={p.isParticipating} disabled={!p.hasPref} onChange={e => updateCapTable(idx, 'isParticipating', e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 disabled:opacity-30" />
                      </td>
                      <td className="px-5 py-3 text-center">
                        <input type="radio" name="mainFounder" checked={p.isMainFounder} onChange={() => { const newCT = capTable.map(c => ({...c, isMainFounder: false})); newCT[idx].isMainFounder = true; setCapTable(newCT); }} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                      </td>
                      <td className="px-5 py-3 text-center">
                        <button onClick={() => handleRemoveShareholder(p.id)} className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors" title="Remover acionista">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex justify-start">
              <button onClick={handleAddShareholder} className="flex items-center gap-1.5 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2.5 rounded-xl transition-all shadow-sm shadow-indigo-600/10">
                <Plus className="w-4 h-4" /> Adicionar Sócio
              </button>
            </div>
          </div>
        )}

        {/* --- TAB 2: COMPANY FINANCE & PROJECTIONS --- */}
        {activeTab === 'company' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CURRENT METRICS */}
            <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/60 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-5 border-b border-slate-100 pb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                Finanças Atuais & Valuation
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nome da Empresa</label>
                    <input type="text" value={company.name} onChange={e => setCompany({...company, name: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tipo de Empresa</label>
                    <select value={company.companyType} onChange={e => setCompany({...company, companyType: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                      <option>SaaS</option><option>Serviços</option><option>E-commerce</option><option>Marketplace</option><option>Fintech</option><option>Consultoria</option><option>Outro</option>
                    </select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Receita Anual (LTM)</label>
                    <input type="number" value={company.revenue} onChange={e => setCompany({...company, revenue: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">ARR (Receita Recorrente)</label>
                    <input type="number" value={company.arr} onChange={e => setCompany({...company, arr: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">EBITDA Atual</label>
                    <input type="number" value={company.ebitda} onChange={e => setCompany({...company, ebitda: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Caixa Atual</label>
                    <input type="number" value={company.cash} onChange={e => setCompany({...company, cash: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Dívida Atual</label>
                    <input type="number" value={company.debt} onChange={e => setCompany({...company, debt: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Dívida Líquida</label>
                    <div className="p-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 text-sm border border-slate-100">
                      {formatCurrency((Number(company.debt) || 0) - (Number(company.cash) || 0))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Métrica de Valuation
                      <Tooltip content="Métrica principal que servirá para guiar o valuation baseado no múltiplo." />
                    </label>
                    <select value={company.valMetric} onChange={e => setCompany({...company, valMetric: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all">
                      <option>ARR</option><option>Revenue</option><option>EBITDA</option><option>Manual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Múltiplo Atual
                      <Tooltip content="Múltiplo aplicado sobre a métrica escolhida." />
                    </label>
                    <input type="number" step="0.5" value={company.currentMultiple} disabled={company.valMetric==='Manual'} onChange={e => setCompany({...company, currentMultiple: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all disabled:bg-slate-50 disabled:text-slate-400" />
                  </div>
                  {company.valMetric === 'Manual' && (
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1.5">Valuation HOJE Fixo (R$)</label>
                      <input type="number" value={company.manualValuation} onChange={e => setCompany({...company, manualValuation: e.target.value})} className="w-full p-2.5 border border-indigo-200 bg-indigo-50/30 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-semibold" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* FUTURE ORGANIC PROJECTION */}
            <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/60 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-5 border-b border-slate-100 pb-3 flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-600" />
                Premissas de Crescimento & CDI
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Horizonte Simulação (Anos)</label>
                    <input type="number" value={company.projectionYears} onChange={e => setCompany({...company, projectionYears: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Crescimento Orgânico a.a. (%)
                      <Tooltip content="Taxa de crescimento anual projetada para a empresa se ela decidir NÃO captar recursos e crescer organicamente." />
                    </label>
                    <input type="number" value={company.growthRate} onChange={e => setCompany({...company, growthRate: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1.5">
                      Taxa do CDI Líquida a.a. (%)
                      <Tooltip content="Taxa anual média esperada para aplicar o dinheiro da venda imediata no banco, acumulando juros compostos sem risco." />
                    </label>
                    <input type="number" step="0.5" value={company.safeYieldRate} onChange={e => setCompany({...company, safeYieldRate: e.target.value})} className="w-full p-2.5 border border-indigo-200 bg-indigo-50/20 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-semibold" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Margem EBITDA Futura (%)</label>
                    <input type="number" value={company.targetEbitdaMargin} onChange={e => setCompany({...company, targetEbitdaMargin: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Múltiplo de Saída (Exit)
                      <Tooltip content="Múltiplo de mercado projetado para a venda no ano 5." />
                    </label>
                    <input type="number" step="0.5" value={company.exitMultiple} disabled={Number(company.manualExitValuationOrg) > 0} onChange={e => setCompany({...company, exitMultiple: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all disabled:bg-slate-50 disabled:text-slate-400" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-purple-600 uppercase tracking-wider mb-1.5">
                      Valuation Saída Fixo (R$)
                      <Tooltip content="Preencha apenas se quiser forçar um valor de venda fixo para o exit orgânico, ignorando a projeção por múltiplos." />
                    </label>
                    <input type="number" value={company.manualExitValuationOrg} onChange={e => setCompany({...company, manualExitValuationOrg: e.target.value})} className="w-full p-2.5 border border-purple-200 bg-purple-50/30 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder-purple-300 font-semibold" placeholder="Opcional" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Caixa Estimado no Ano de Saída</label>
                    <input type="number" value={company.futureCash} onChange={e => setCompany({...company, futureCash: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Dívida Estimada no Ano de Saída</label>
                    <input type="number" value={company.futureDebt} onChange={e => setCompany({...company, futureDebt: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 3: SCENARIOS & RISKS --- */}
        {activeTab === 'scenarios' && (
          <div className="space-y-6">
            
            {/* EXIT PAYMENT STRUCTURE */}
            <div className="bg-white rounded-2xl shadow-md border border-slate-200/60 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-5 border-b border-slate-100 pb-3 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-600" />
                Estrutura de Pagamento no Exit (M&A)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    % Pago no Fechamento (Upfront)
                    <Tooltip content="Fração do preço de venda pago em dinheiro ou ações à vista na assinatura do contrato." />
                  </label>
                  <input type="number" value={scenarios.upfrontPercent} onChange={e => {
                    const upVal = Number(e.target.value) || 0;
                    setScenarios({
                      ...scenarios,
                      upfrontPercent: e.target.value,
                      earnoutPercent: Math.max(0, 100 - upVal).toString()
                    });
                  }} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-semibold" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    % Condicionado (Earn-out)
                    <Tooltip content="Preço retido para pagamento futuro associado ao cumprimento de metas. Calculado automaticamente como a sobra do upfront." />
                  </label>
                  <input type="number" value={scenarios.earnoutPercent} disabled className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-400 font-bold outline-none cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Probabilidade de Recebimento do Earn-out (%)
                    <Tooltip content="Fator de probabilidade estratégica aplicada sobre o earn-out bruto para modelar o valor líquido real esperado no bolso." />
                  </label>
                  <input type="number" value={scenarios.earnoutProbability} onChange={e => setScenarios({...scenarios, earnoutProbability: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-semibold" />
                </div>
              </div>
            </div>

            {/* FUNDRAISING & ROADMAP SCENARIO */}
            <div className="bg-white rounded-2xl shadow-md border border-blue-200 p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 border-b border-blue-100 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-blue-600" />
                    Cenário: Captação de Investimento & Aceleração
                  </h2>
                  <p className="text-xs text-blue-700/80 mt-0.5">Configure as rodadas ativas. Novas ações serão criadas diluindo os acionistas atuais.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-blue-800">Crescimento Acelerado pós-captação (% a.a.):</label>
                    <input type="number" value={scenarios.fundraising.newGrowthRate} onChange={e => setScenarios({...scenarios, fundraising: {...scenarios.fundraising, newGrowthRate: e.target.value}})} className="w-20 p-2 border border-blue-200 rounded-lg text-center font-bold text-blue-900 focus:ring-2 focus:ring-blue-500/20 outline-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-purple-700">Valuation Saída Fixo (R$):</label>
                    <input type="number" value={scenarios.fundraising.manualExitValuation} onChange={e => setScenarios({...scenarios, fundraising: {...scenarios.fundraising, manualExitValuation: e.target.value}})} className="w-32 p-2 border border-purple-200 bg-purple-50/20 rounded-lg text-center font-bold text-purple-900 placeholder-purple-300 focus:ring-2 focus:ring-purple-500/20 outline-none" placeholder="Opcional" title="Sobrescreve o múltiplo e define o EV fixo do cenário com captação" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {scenarios.fundraising.rounds.map((round) => (
                  <div key={round.id} className={`border p-5 rounded-2xl transition-all ${round.active ? 'border-blue-300 bg-blue-50/10 shadow-sm' : 'border-slate-200 bg-slate-50/30 opacity-60'}`}>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-slate-900">{round.name}</h3>
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={round.active} onChange={e => updateRound(round.id, 'active', e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                        Ativar Rodada
                      </label>
                    </div>

                    <div className={`space-y-3.5 ${!round.active ? 'pointer-events-none' : ''}`}>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Valor Captado (R$)</label>
                        <input type="number" value={round.amount} onChange={e => updateRound(round.id, 'amount', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Valuation Pre-Money (R$)</label>
                        <input type="number" value={round.preMoney} onChange={e => updateRound(round.id, 'preMoney', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Liq. Pref (Mult)</label>
                          <input type="number" step="0.5" value={round.prefMultiple} onChange={e => updateRound(round.id, 'prefMultiple', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-center" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Option Pool (+%)</label>
                          <input type="number" value={round.optionPoolIncrease} onChange={e => updateRound(round.id, 'optionPoolIncrease', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-center" />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                        <input type="checkbox" checked={round.isParticipating} id={`part-${round.id}`} onChange={e => updateRound(round.id, 'isParticipating', e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                        <label htmlFor={`part-${round.id}`} className="text-xs font-semibold text-slate-700 cursor-pointer">Novo investidor é participante</label>
                      </div>

                      <div className="pt-3 border-t border-slate-100 mt-2 bg-indigo-50/20 p-2.5 rounded-xl border border-indigo-100/50">
                        <label className="block text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <Percent className="w-3.5 h-3.5" /> Venda Secundária Founder (%)
                        </label>
                        <div className="flex gap-2 items-center">
                          <input type="number" step="0.5" value={round.secondaryPercent} onChange={e => updateRound(round.id, 'secondaryPercent', e.target.value)} className="w-16 p-1.5 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-900 bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                          <span className="text-[9px] text-slate-500 leading-tight">% da própria fatia liquidada no Pre-Money</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* DIVIDENDS SCENARIO */}
            <div className="bg-white rounded-2xl shadow-md border border-emerald-200 p-6">
              <h2 className="text-lg font-bold text-emerald-900 mb-2 border-b border-emerald-100 pb-3 flex items-center gap-2">
                <Percent className="w-5 h-5 text-emerald-600" />
                Cenário: Distribuição de Dividendos
              </h2>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <div className="flex-1 text-xs text-slate-600 leading-relaxed">
                  Este cenário projeta a empresa crescendo organicamente por {company.projectionYears} anos, porém distribuindo caixa recorrente do EBITDA como dividendos ao longo do caminho. Os dividendos serão taxados sob a **regra de isenção de R$ 50k/mês** por sócio.
                </div>
                <div className="w-full sm:w-64 bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col items-center">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">% EBITDA Anual Distribuído</label>
                  <div className="flex items-center gap-3 w-full">
                    <input type="range" min="0" max="100" value={scenarios.dividends.distributePercentage} onChange={e => setScenarios({...scenarios, dividends: {distributePercentage: e.target.value}})} className="w-full accent-emerald-600" />
                    <span className="text-sm font-bold text-emerald-700 w-10 text-right">{scenarios.dividends.distributePercentage}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* RISK DISCOUNTS SETTING */}
            <div className="bg-white rounded-2xl shadow-md border border-slate-200/60 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-2 border-b border-slate-100 pb-3 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-indigo-600" />
                Desconto de Risco de Execução (Risco de Inércia / Escala)
              </h2>
              <p className="text-xs text-slate-500 mb-5">
                Vender a empresa hoje garante 100% de liquidez imediata (Risco 0%). Projetar o futuro envolve sérios riscos (operacional, concorrencial, macro). Ajuste os fatores de desconto abaixo para calcular o **Valor Líquido Ajustado ao Risco** dos cenários futuros.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Cenário Orgânico</label>
                    <span className="text-xs font-bold text-indigo-600">{riskDiscounts.organic}%</span>
                  </div>
                  <input type="range" min="0" max="90" value={riskDiscounts.organic} onChange={e => setRiskDiscounts({...riskDiscounts, organic: e.target.value})} className="w-full accent-indigo-600" />
                  <p className="text-[9px] text-slate-400 mt-2 leading-normal">Incerteza de sustentar o crescimento sem nova captação e sobreviver a ataques de competidores.</p>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Cenário Captação</label>
                    <span className="text-xs font-bold text-indigo-600">{riskDiscounts.fundraising}%</span>
                  </div>
                  <input type="range" min="0" max="90" value={riskDiscounts.fundraising} onChange={e => setRiskDiscounts({...riskDiscounts, fundraising: e.target.value})} className="w-full accent-indigo-600" />
                  <p className="text-[9px] text-slate-400 mt-2 leading-normal">Risco de execução extremo ao buscar alavancagem agressiva, governança complexa e a cobrança dos investidores.</p>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Cenário Dividendos</label>
                    <span className="text-xs font-bold text-indigo-600">{riskDiscounts.dividends}%</span>
                  </div>
                  <input type="range" min="0" max="90" value={riskDiscounts.dividends} onChange={e => setRiskDiscounts({...riskDiscounts, dividends: e.target.value})} className="w-full accent-indigo-600" />
                  <p className="text-[9px] text-slate-400 mt-2 leading-normal">Um risco menor que o puro orgânico, pois o founder faz "de-risking" patrimonial ao retirar caixa anualmente.</p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* --- TAB 4: RESULTS & PRESENTATION --- */}
        {activeTab === 'results' && results && (
          <div className="space-y-6">
            
            {/* MAIN OUTCOME CARDS (NOMINAL VS RISK-ADJUSTED) */}
            <div>
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Outcome Esperado para {mainFounder.name}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                
                {/* CARD 1: TODAY + CDI */}
                <div className="bg-slate-900 rounded-2xl p-5 text-white border border-slate-800 shadow-md flex flex-col justify-between h-44 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 bg-indigo-600/10 rounded-full blur-xl pointer-events-none"></div>
                  <div>
                    <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-widest bg-indigo-500/20 px-2 py-0.5 rounded">Garantido • Risco 0%</span>
                    <h4 className="text-xs text-slate-400 mt-2">Venda Hoje + CDI ({results.pYears}a)</h4>
                    <div className="text-2xl font-black text-white mt-1.5">{formatCurrency(results.cdi.total)}</div>
                  </div>
                  <div className="text-[10px] text-slate-400 border-t border-slate-800/80 pt-2 flex justify-between">
                    <span>Venda à vista: {formatCurrency(results.founder.today.totalLiquido)}</span>
                    <span className="text-emerald-400 font-semibold">CDI: +{formatPercent(Number(company.safeYieldRate))}</span>
                  </div>
                </div>

                {/* CARD 2: ORGANIC */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm flex flex-col justify-between h-44">
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">Orgânico • Risco {riskDiscounts.organic}%</span>
                    <h4 className="text-xs text-slate-500 mt-2">Crescimento Orgânico</h4>
                    <div className="text-xl font-extrabold text-slate-900 mt-1.5">{formatCurrency(results.founder.org.totalLiquido)}</div>
                    <div className="text-xs text-indigo-600 font-bold mt-1">Ajustado: {formatCurrency(results.founder.org.totalLiquido * (1 - Number(riskDiscounts.organic)/100))}</div>
                  </div>
                  <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                    Valuation Saída: {formatCurrency(results.ev.org)}
                  </div>
                </div>

                {/* CARD 3: FUNDRAISING SEM SECUNDÁRIA */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm flex flex-col justify-between h-44 relative">
                  {results.founder.fundNoSec.totalLiquido * (1 - Number(riskDiscounts.fundraising)/100) > Math.max(results.founder.org.totalLiquido * (1 - Number(riskDiscounts.organic)/100), results.cdi.total) && (
                    <div className="absolute -top-2.5 right-3 bg-slate-700 text-white text-[8px] font-bold px-2 py-0.5 rounded-full shadow-md">MELHOR S/ SEC</div>
                  )}
                  <div>
                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">Captação S/ Sec • Risco {riskDiscounts.fundraising}%</span>
                    <h4 className="text-xs text-slate-500 mt-2">Captação Sem Secundária</h4>
                    <div className="text-xl font-extrabold text-slate-900 mt-1.5">{formatCurrency(results.founder.fundNoSec.totalLiquido)}</div>
                    <div className="text-xs text-indigo-600 font-bold mt-1">Ajustado: {formatCurrency(results.founder.fundNoSec.totalLiquido * (1 - Number(riskDiscounts.fundraising)/100))}</div>
                  </div>
                  <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                    <span>Valuation: {formatCurrency(results.ev.fund)}</span>
                  </div>
                </div>

                {/* CARD 4: FUNDRAISING COM SECUNDÁRIA */}
                <div className="bg-white rounded-2xl p-5 border border-blue-200 shadow-sm flex flex-col justify-between h-44 relative">
                  {results.founder.fundWithSec.totalLiquido * (1 - Number(riskDiscounts.fundraising)/100) > Math.max(results.founder.org.totalLiquido * (1 - Number(riskDiscounts.organic)/100), results.cdi.total) && (
                    <div className="absolute -top-2.5 right-3 bg-blue-600 text-white text-[8px] font-bold px-2 py-0.5 rounded-full shadow-md">MELHOR C/ SEC</div>
                  )}
                  <div>
                    <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded">Captação C/ Sec • Risco {riskDiscounts.fundraising}%</span>
                    <h4 className="text-xs text-slate-500 mt-2">Captação Com Secundária</h4>
                    <div className="text-xl font-extrabold text-slate-900 mt-1.5">{formatCurrency(results.founder.fundWithSec.totalLiquido)}</div>
                    <div className="text-xs text-blue-600 font-bold mt-1">Ajustado: {formatCurrency(results.founder.fundWithSec.totalLiquido * (1 - Number(riskDiscounts.fundraising)/100))}</div>
                  </div>
                  <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2 flex justify-between">
                    <span>Valuation: {formatCurrency(results.ev.fund)}</span>
                    {results.founder.fundWithSec.secondaryNet > 0 && <span className="text-indigo-600 font-semibold">Secundária: {formatCurrency(results.founder.fundWithSec.secondaryNet)}</span>}
                  </div>
                </div>

                {/* CARD 5: DIVIDENDS */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm flex flex-col justify-between h-44">
                  <div>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">Dividendos • Risco {riskDiscounts.dividends}%</span>
                    <h4 className="text-xs text-slate-500 mt-2">Dividendos + Venda</h4>
                    <div className="text-xl font-extrabold text-slate-900 mt-1.5">{formatCurrency(results.founder.divs.totalLiquido)}</div>
                    <div className="text-xs text-indigo-600 font-bold mt-1">Ajustado: {formatCurrency(results.founder.divs.totalLiquido * (1 - Number(riskDiscounts.dividends)/100))}</div>
                  </div>
                  <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2 flex justify-between">
                    <span>Valuation: {formatCurrency(results.ev.org)}</span>
                    <span className="text-emerald-600 font-bold">Retiradas: {formatCurrency(results.founder.divs.divsLiquido)}</span>
                  </div>
                </div>

              </div>
            </div>

            {/* CONSOLIDATED TABLE */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/20">
                <h3 className="font-bold text-slate-900 text-sm">Tabela Comparativa Consolidada</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100 text-xs">
                    <tr>
                      <th className="px-5 py-3">Cenário</th>
                      <th className="px-5 py-3 text-right">Valuation Saída (EV)</th>
                      <th className="px-5 py-3 text-center">Hurdle de Crescimento <Tooltip content="O multiplicador de crescimento necessário em relação ao valuation atual da empresa para que este cenário aconteça." /></th>
                      <th className="px-5 py-3 text-center">Part. Final (%)</th>
                      <th className="px-5 py-3 text-right">Líquido Nominal</th>
                      <th className="px-5 py-3 text-center">Desconto de Risco</th>
                      <th className="px-5 py-3 text-right text-indigo-700 bg-indigo-50/20 font-extrabold">Líquido c/ Risco</th>
                      <th className="px-5 py-3 text-center">Retiradas Prévias <Tooltip content="Valores recebidos pelo founder ANTES do exit final, seja através de dividendos ao longo do caminho ou venda secundária em rodadas." /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Venda Hoje */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="px-5 py-3.5 font-bold text-slate-900 flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5 text-slate-400" /> Venda Hoje + CDI</td>
                      <td className="px-5 py-3.5 text-right font-medium">{formatCurrency(results.ev.today)}</td>
                      <td className="px-5 py-3.5 text-center"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-bold">1,0x (Atual)</span></td>
                      <td className="px-5 py-3.5 text-center">{formatPercent(Number(mainFounder.ownership))}</td>
                      <td className="px-5 py-3.5 text-right font-semibold">{formatCurrency(results.cdi.total)}</td>
                      <td className="px-5 py-3.5 text-center"><span className="text-slate-400 font-medium">0%</span></td>
                      <td className="px-5 py-3.5 text-right font-bold text-indigo-900 bg-indigo-50/25">{formatCurrency(results.cdi.total)}</td>
                      <td className="px-5 py-3.5 text-center text-slate-400">—</td>
                    </tr>
                    {/* Orgânico */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="px-5 py-3.5 font-bold text-slate-900 flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5 text-slate-400" /> Crescimento Orgânico</td>
                      <td className="px-5 py-3.5 text-right font-medium">{formatCurrency(results.ev.org)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-bold">
                          {(results.ev.org / (results.ev.today || 1)).toFixed(1)}x
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">{formatPercent(Number(mainFounder.ownership))}</td>
                      <td className="px-5 py-3.5 text-right font-semibold">{formatCurrency(results.founder.org.totalLiquido)}</td>
                      <td className="px-5 py-3.5 text-center font-bold text-rose-600">{riskDiscounts.organic}%</td>
                      <td className="px-5 py-3.5 text-right font-bold text-indigo-950 bg-indigo-50/25">
                        {formatCurrency(results.founder.org.totalLiquido * (1 - Number(riskDiscounts.organic)/100))}
                      </td>
                      <td className="px-5 py-3.5 text-center text-slate-400">—</td>
                    </tr>
                    {/* Captação Sem Secundária */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="px-5 py-3.5 font-bold text-slate-900 flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5 text-slate-500" /> Captação S/ Secundária</td>
                      <td className="px-5 py-3.5 text-right font-medium">{formatCurrency(results.ev.fund)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">
                          {(results.ev.fund / (results.ev.today || 1)).toFixed(1)}x
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-semibold text-slate-600">{formatPercent(results.founder.fundNoSec.totalLiquido > 0 ? results.founder.fundNoSec.ownership : 0)}</td>
                      <td className="px-5 py-3.5 text-right font-semibold">{formatCurrency(results.founder.fundNoSec.totalLiquido)}</td>
                      <td className="px-5 py-3.5 text-center font-bold text-rose-600">{riskDiscounts.fundraising}%</td>
                      <td className="px-5 py-3.5 text-right font-bold text-indigo-950 bg-indigo-50/25">
                        {formatCurrency(results.founder.fundNoSec.totalLiquido * (1 - Number(riskDiscounts.fundraising)/100))}
                      </td>
                      <td className="px-5 py-3.5 text-center text-slate-400">—</td>
                    </tr>
                    {/* Captação Com Secundária */}
                    <tr className="hover:bg-blue-50/30 bg-blue-50/10">
                      <td className="px-5 py-3.5 font-bold text-slate-900 flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5 text-blue-500" /> Captação C/ Secundária</td>
                      <td className="px-5 py-3.5 text-right font-medium">{formatCurrency(results.ev.fund)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">
                          {(results.ev.fund / (results.ev.today || 1)).toFixed(1)}x
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-semibold text-blue-600">{formatPercent(results.founder.fundWithSec.totalLiquido > 0 ? results.founder.fundWithSec.ownership : 0)}</td>
                      <td className="px-5 py-3.5 text-right font-semibold">{formatCurrency(results.founder.fundWithSec.totalLiquido)}</td>
                      <td className="px-5 py-3.5 text-center font-bold text-rose-600">{riskDiscounts.fundraising}%</td>
                      <td className="px-5 py-3.5 text-right font-bold text-indigo-950 bg-indigo-50/25">
                        {formatCurrency(results.founder.fundWithSec.totalLiquido * (1 - Number(riskDiscounts.fundraising)/100))}
                      </td>
                      <td className="px-5 py-3.5 text-center font-semibold text-indigo-600">
                        {results.founder.fundWithSec.secondaryNet > 0 ? `Secundária: ${formatCurrency(results.founder.fundWithSec.secondaryNet)}` : 'Nenhuma'}
                      </td>
                    </tr>
                    {/* Dividendos */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="px-5 py-3.5 font-bold text-slate-900 flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5 text-slate-400" /> Dividendos + Venda</td>
                      <td className="px-5 py-3.5 text-right font-medium">{formatCurrency(results.ev.org)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-bold">
                          {(results.ev.org / (results.ev.today || 1)).toFixed(1)}x
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">{formatPercent(Number(mainFounder.ownership))}</td>
                      <td className="px-5 py-3.5 text-right font-semibold">{formatCurrency(results.founder.divs.totalLiquido)}</td>
                      <td className="px-5 py-3.5 text-center font-bold text-rose-600">{riskDiscounts.dividends}%</td>
                      <td className="px-5 py-3.5 text-right font-bold text-indigo-950 bg-indigo-50/25">
                        {formatCurrency(results.founder.divs.totalLiquido * (1 - Number(riskDiscounts.dividends)/100))}
                      </td>
                      <td className="px-5 py-3.5 text-center font-semibold text-emerald-600">
                        {results.founder.divs.divsLiquido > 0 ? `Dividendos: ${formatCurrency(results.founder.divs.divsLiquido)}` : 'Nenhum'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* STRATEGIC SLIDE PRESENTATION BOX */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-xl relative">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    Resumo de Recomendação Estratégica (Copiar para Slide)
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">Este resumo foca de forma sintética nos requisitos necessários para viabilizar cada cenário.</p>
                </div>
                <button onClick={handleCopySlide} className="flex items-center gap-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 px-3.5 py-2 rounded-xl transition-all border border-white/10 text-white">
                  {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copiado!' : 'Copiar Texto'}
                </button>
              </div>

              <textarea 
                readOnly 
                value={slideText} 
                className="w-full h-80 bg-black/30 border border-white/10 rounded-xl p-4 text-slate-200 text-xs font-mono leading-relaxed outline-none focus:border-indigo-500 transition-all resize-none" 
              />
            </div>

            {/* KEY BUSINESS INDICATORS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* INDICATOR 1: EARNOUT DEPENDENCY */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Análise de Risco Comercial</span>
                  <h4 className="text-sm font-bold text-slate-800 mt-1.5">Dependência de Earn-out (Cenário Captação)</h4>
                  <p className="text-xs text-slate-500 mt-1">Fração do resultado do founder principal que está condicionado ao cumprimento de metas futuras.</p>
                </div>
                {results.founder.fundWithSec.totalLiquido > 0 ? (
                  <div className="mt-4">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-xl font-black text-slate-900">
                        {((results.founder.fundWithSec.earnoutLiquido / results.founder.fundWithSec.totalLiquido) * 100).toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-slate-400">Total condicionado</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          (results.founder.fundWithSec.earnoutLiquido / results.founder.fundWithSec.totalLiquido) > 0.25 ? 'bg-amber-500' : 'bg-indigo-600'
                        }`} 
                        style={{ width: `${Math.min(100, (results.founder.fundWithSec.earnoutLiquido / results.founder.fundWithSec.totalLiquido) * 100)}%` }} 
                      />
                    </div>
                    {(results.founder.fundWithSec.earnoutLiquido / results.founder.fundWithSec.totalLiquido) > 0.25 && (
                      <p className="text-[10px] text-amber-600 font-bold mt-2">⚠️ Risco relevante de Earn-out! O valuation nominal pode mascarar o dinheiro efetivo.</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 text-xs text-slate-400 font-medium">Nenhum valor simulado.</div>
                )}
              </div>

              {/* INDICATOR 2: DE-RISKING */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Patrimônio Antecipado (De-risking)</span>
                  <h4 className="text-sm font-bold text-slate-800 mt-1.5">Liquidez Antecipada</h4>
                  <p className="text-xs text-slate-500 mt-1">Valores retirados do negócio antes do evento final de exit (soma de Secundárias + Dividendos).</p>
                </div>
                <div className="mt-4 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Cenário Captação (c/ Sec):</span>
                    <span className="font-bold text-indigo-600">{formatCurrency(results.founder.fundWithSec.secondaryNet)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Cenário Dividendos:</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(results.founder.divs.divsLiquido)}</span>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1.5 leading-tight">Antecipar liquidez reduz drasticamente a ansiedade pessoal do founder e aumenta sua resiliência de longo prazo.</p>
                </div>
              </div>

              {/* INDICATOR 3: EFFECTIVE DILUTION */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Diluição no Outcome</span>
                  <h4 className="text-sm font-bold text-slate-800 mt-1.5">Diluição Efetiva</h4>
                  <p className="text-xs text-slate-500 mt-1">Diferença absoluta entre a participação acionária de partida e a fatia final no exit.</p>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Participação Inicial:</span>
                    <span className="font-semibold text-slate-800">{formatPercent(Number(mainFounder.ownership))}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Final S/ Secundária:</span>
                    <span className="font-bold text-slate-600">{formatPercent(results.founder.fundNoSec.totalLiquido > 0 ? results.founder.fundNoSec.ownership : 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Final C/ Secundária:</span>
                    <span className="font-bold text-blue-600">{formatPercent(results.founder.fundWithSec.totalLiquido > 0 ? results.founder.fundWithSec.ownership : 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-slate-100 pt-2 font-bold">
                    <span className="text-slate-800">Diluição Máxima (P.P.):</span>
                    <span className="text-rose-600">
                      -{formatPercent(Math.max(0, Number(mainFounder.ownership) - (results.founder.fundWithSec.totalLiquido > 0 ? results.founder.fundWithSec.ownership : 0)))}
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* EXACT BREAK-EVEN & HURDLES */}
            <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-0">
              
              <div className="p-6 bg-indigo-50/20 border-b lg:border-b-0 lg:border-r border-indigo-100 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-indigo-950 text-sm">Hurdles de Saída (Break-Even)</h4>
                  <p className="text-xs text-indigo-900/60 mt-1.5">
                    Hurdle é o ponto de equilíbrio matemático independente das suas premissas. Mostra o valor que a empresa precisa ser vendida para justificar cada opção.
                  </p>
                </div>
                <div className="space-y-4 mt-6">
                  <div className="p-3 bg-white border border-indigo-100 rounded-xl">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Para empatar com "Venda Hoje + CDI"</span>
                    <div className="mt-1 flex justify-between items-baseline">
                      <span className="text-xs text-slate-600">No Orgânico:</span>
                      <span className="text-sm font-bold text-indigo-950">{formatCurrency(results.breakEvens.orgCdi)}</span>
                    </div>
                    <div className="flex justify-between items-baseline mt-1">
                      <span className="text-xs text-slate-600">Captação S/ Sec:</span>
                      <span className="text-sm font-bold text-indigo-950">{formatCurrency(results.breakEvens.fundNoSecCdi)}</span>
                    </div>
                    <div className="flex justify-between items-baseline mt-1">
                      <span className="text-xs text-slate-600">Captação C/ Sec:</span>
                      <span className="text-sm font-bold text-indigo-950">{formatCurrency(results.breakEvens.fundWithSecCdi)}</span>
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">Para Captação superar o Orgânico</span>
                    <div className="flex justify-between items-baseline mt-1">
                      <span className="text-xs text-blue-600">S/ Secundária:</span>
                      <span className="text-sm font-bold text-blue-900">{formatCurrency(results.breakEvens.fundNoSecOrg)}</span>
                    </div>
                    <div className="flex justify-between items-baseline mt-1">
                      <span className="text-xs text-blue-600">C/ Secundária:</span>
                      <span className="text-sm font-bold text-blue-900">{formatCurrency(results.breakEvens.fundWithSecOrg)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SENSITIVITY MATRIX */}
              <div className="p-6 lg:col-span-2">
                <h4 className="font-bold text-slate-800 text-sm mb-4">Matriz de Sensibilidade (Exit EV vs. Bolso do Founder)</h4>
                <div className="overflow-y-auto max-h-80 border border-slate-100 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100 sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5">EV de Saída Simulada</th>
                        <th className="px-4 py-2.5 text-right">Líquido Orgânico</th>
                        <th className="px-4 py-2.5 text-right">Captação S/ Sec</th>
                        <th className="px-4 py-2.5 text-right">Captação C/ Sec</th>
                        <th className="px-4 py-2.5 text-center">Opção Vencedora</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {results.sensitivityMatrix.map((row, i) => (
                        <tr key={i} className={`hover:bg-slate-50/50 ${row.isCurrentOrg || row.isCurrentFund ? 'bg-amber-50/20' : ''}`}>
                          <td className="px-4 py-2.5 font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                            {formatCurrency(row.ev)}
                            {row.isCurrentOrg && <span className="bg-emerald-100 text-emerald-800 text-[8px] font-bold px-1.5 py-0.5 rounded">Projeção Orgânica</span>}
                            {row.isCurrentFund && <span className="bg-blue-100 text-blue-800 text-[8px] font-bold px-1.5 py-0.5 rounded">Projeção Captação</span>}
                            {row.isBreakEvenCdiOrg && <span className="border border-slate-200 text-slate-500 text-[8px] font-bold px-1.5 py-0.5 rounded">Empata CDI (Org)</span>}
                            {row.isBreakEvenCdiFundNoSec && <span className="border border-slate-200 text-slate-500 text-[8px] font-bold px-1.5 py-0.5 rounded">Empata CDI (S/ Sec)</span>}
                            {row.isBreakEvenCdiFundWithSec && <span className="border border-slate-200 text-slate-500 text-[8px] font-bold px-1.5 py-0.5 rounded">Empata CDI (C/ Sec)</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-emerald-600">{formatCurrency(row.netOrg)}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-slate-600">{formatCurrency(row.netFundNoSec)}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-blue-600">{formatCurrency(row.netFundWithSec)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              row.winner === 'Orgânico' ? 'bg-emerald-100 text-emerald-800' :
                              row.winner === 'Captação S/ Sec' ? 'bg-slate-700 text-white' :
                              row.winner === 'Captação C/ Sec' ? 'bg-blue-100 text-blue-800' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {row.winner}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 text-right">Comparação versus CDI de {formatCurrency(results.cdi.total)}.</p>
              </div>

            </div>

            {/* DETAILED WATERFALL & TAX BREAKDOWN */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Detalhamento Financeiro & Tributário (Captação + Exit)</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Veja a abertura de valores recebidos e impostos pagos sob cada modelo.</p>
                </div>
                <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-semibold self-start sm:self-auto shadow-inner">
                  <button 
                    onClick={() => setWaterfallScenario('noSec')}
                    className={`px-3 py-1.5 rounded-md transition-all ${waterfallScenario === 'noSec' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    Sem Secundária
                  </button>
                  <button 
                    onClick={() => setWaterfallScenario('withSec')}
                    className={`px-3 py-1.5 rounded-md transition-all ${waterfallScenario === 'withSec' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    Com Secundária
                  </button>
                </div>
              </div>
              
              {(() => {
                const activeFundResult = waterfallScenario === 'noSec' ? results.founder.fundNoSec : results.founder.fundWithSec;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs mt-4">
                    
                    <div className="space-y-3">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">1. Parcela Upfront Bruta no Exit</span>
                        <span className="font-bold text-slate-800">{formatCurrency(activeFundResult.upfrontBruto)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-rose-600 pl-4">
                        <span>↳ IR Ganho de Capital Upfront (Progressivo)</span>
                        <span>- {formatCurrency(activeFundResult.upfrontTax)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-700 font-semibold pl-4">
                        <span>= Upfront Líquido</span>
                        <span>{formatCurrency(activeFundResult.upfrontLiquido)}</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">2. Earn-out Bruto (Ajustado pela Probabilidade)</span>
                        <span className="font-bold text-slate-800">{formatCurrency(activeFundResult.earnoutEsperado)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-rose-600 pl-4">
                        <span>↳ IR Ganho de Capital Earn-out</span>
                        <span>- {formatCurrency(activeFundResult.earnoutTax)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-700 font-semibold pl-4">
                        <span>= Earn-out Líquido Esperado</span>
                        <span>{formatCurrency(activeFundResult.earnoutLiquido)}</span>
                      </div>
                    </div>

                    <div className="space-y-3 border-t border-slate-100 pt-4">
                      <div className="flex justify-between py-1 border-b border-slate-100 text-indigo-700">
                        <span className="font-semibold">3. Secundárias Acumuladas Brutas</span>
                        <span className="font-bold">{formatCurrency(activeFundResult.secondaryGross)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-rose-600 pl-4">
                        <span>↳ IR Ganho de Capital Secundárias</span>
                        <span>- {formatCurrency(activeFundResult.secondaryTax)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-700 font-semibold pl-4">
                        <span>= Secundária Líquida Recebida</span>
                        <span>{formatCurrency(activeFundResult.secondaryNet)}</span>
                      </div>
                    </div>

                    <div className="space-y-3 border-t border-slate-100 pt-4 flex flex-col justify-between h-full">
                      <div>
                        <div className="flex justify-between py-1 text-red-700 font-bold bg-red-50 p-2 rounded-xl">
                          <span>Total Impostos Pagos (Leão)</span>
                          <span>- {formatCurrency(activeFundResult.totalTaxPaid)}</span>
                        </div>
                      </div>
                      <div className="bg-slate-900 text-emerald-400 p-4 rounded-2xl flex justify-between items-center font-bold text-lg shadow-inner">
                        <span>Líquido no Bolso (Total Esperado)</span>
                        <span>{formatCurrency(activeFundResult.totalLiquido)}</span>
                      </div>
                    </div>

                  </div>
                );
              })()}
            </div>

            {/* SYSTEM DISCLAIMER */}
            <div className="bg-slate-100 border border-slate-200 p-4 rounded-xl text-[10px] text-slate-500 leading-relaxed font-sans shadow-sm">
              <span className="font-bold text-slate-700 block mb-1">⚠️ AVISO LEGAL & TRIBUTÁRIO</span>
              Esta simulação consiste em uma estimativa estratégica baseada nas fórmulas padrão de mercado e no regime progressivo de ganho de capital brasileiro para pessoa física (Leis 13.259/16). Ela não constitui, sob qualquer hipótese, assessoria legal, contábil, tributária ou financeira formal. Os resultados reais dependem das premissas inseridas pelo operador e podem variar substancialmente conforme cláusulas contratuais específicas, escrow, indenizações, acordos de acionistas de alta complexidade ou decisões fiscais. Sempre consulte assessores jurídicos e tributários qualificados antes de qualquer transação de M&A ou captação.
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
