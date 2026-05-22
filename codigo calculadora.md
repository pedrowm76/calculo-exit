import React, { useState, useMemo } from 'react';
import { 
  Calculator, PieChart, TrendingUp, DollarSign, 
  AlertTriangle, Copy, CheckCircle, Info, ChevronRight, Briefcase, Target, Table as TableIcon
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

// --- CORE MATH & TAX ENGINE ---
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

// --- APP COMPONENT ---
export default function App() {
  const [activeTab, setActiveTab] = useState('captable');
  const [copied, setCopied] = useState(false);

  // --- STATE: CAP TABLE (Strings to avoid React input lock) ---
  const [capTable, setCapTable] = useState([
    { id: 1, name: 'Founder Principal', category: 'Founder', ownership: '45', cost: '0', hasPref: false, prefAmount: '0', prefMultiple: '1', isParticipating: false, isMainFounder: true },
    { id: 2, name: 'Co-Founder', category: 'Founder', ownership: '35', cost: '0', hasPref: false, prefAmount: '0', prefMultiple: '1', isParticipating: false, isMainFounder: false },
    { id: 3, name: 'Investidor Seed', category: 'Investidor', ownership: '15', cost: '2000000', hasPref: true, prefAmount: '2000000', prefMultiple: '1', isParticipating: false, isMainFounder: false },
    { id: 4, name: 'Option Pool', category: 'Pool', ownership: '5', cost: '0', hasPref: false, prefAmount: '0', prefMultiple: '1', isParticipating: false, isMainFounder: false },
  ]);

  // --- STATE: COMPANY & PROJECTIONS (Strings) ---
  const [company, setCompany] = useState({
    name: 'Empresa XYZ',
    revenue: '15000000',
    arr: '12000000',
    ebitda: '1500000',
    cash: '2000000',
    debt: '1000000',
    valMetric: 'ARR', // 'Revenue', 'ARR', 'EBITDA', 'Manual'
    currentMultiple: '4',
    manualValuation: '', // Valuation HOJE override
    
    projectionYears: '5',
    growthRate: '25', // %
    targetEbitdaMargin: '15', // %
    exitMultiple: '5',
    manualExitValuationOrg: '', // Valuation de SAÍDA (Orgânico)
    safeYieldRate: '10', // Taxa CDI
    futureCash: '5000000',
    futureDebt: '0',
  });

  // --- STATE: SCENARIO PARAMETERS (Strings) ---
  const [scenarios, setScenarios] = useState({
    upfrontPercent: '80', // %
    earnoutPercent: '20', // %
    earnoutProbability: '60', // %
    
    fundraising: {
      newGrowthRate: '40', // %
      manualExitValuation: '', // Valuation de SAÍDA (Captação)
      rounds: [
        { id: 'A', name: 'Série A', active: true, amount: '15000000', preMoney: '60000000', optionPoolIncrease: '5', prefMultiple: '1', secondaryPercent: '0' },
        { id: 'B', name: 'Série B', active: false, amount: '50000000', preMoney: '150000000', optionPoolIncrease: '0', prefMultiple: '1', secondaryPercent: '0' },
        { id: 'C', name: 'Série C', active: false, amount: '100000000', preMoney: '400000000', optionPoolIncrease: '0', prefMultiple: '1', secondaryPercent: '0' },
      ]
    },
    
    dividends: {
      distributePercentage: '40', // % of EBITDA
    }
  });

  // --- VALIDATIONS ---
  const totalOwnership = capTable.reduce((sum, p) => sum + (Number(p.ownership) || 0), 0);
  const isCapTableValid = Math.abs(totalOwnership - 100) < 0.01;
  const mainFounder = capTable.find(p => p.isMainFounder) || capTable[0];

  // --- ENGINE: CALCULATE ALL SCENARIOS ---
  const results = useMemo(() => {
    if (!isCapTableValid) return null;

    // Converte estado string para numero blindado
    const pYears = Number(company.projectionYears) || 0;
    const currentRev = Number(company.revenue) || 0;
    const currentArr = Number(company.arr) || 0;
    const currentEbitda = Number(company.ebitda) || 0;
    const currentCash = Number(company.cash) || 0;
    const currentDebt = Number(company.debt) || 0;
    const futureCash = Number(company.futureCash) || 0;
    const futureDebt = Number(company.futureDebt) || 0;
    const exitMultiple = Number(company.exitMultiple) || 0;
    const growthRate = Number(company.growthRate) || 0;
    const targetEbitdaMargin = Number(company.targetEbitdaMargin) || 0;
    
    // 1. Current Valuation (Sell Today)
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

    // 2. Organic Projection (5 Years)
    const orgRevFinal = currentRev * Math.pow(1 + growthRate / 100, pYears);
    const orgArrFinal = currentArr * Math.pow(1 + growthRate / 100, pYears);
    const orgEbitdaFinal = orgRevFinal * (targetEbitdaMargin / 100);
    
    let orgFutureEV = 0;
    const manualOrgEvOverride = Number(company.manualExitValuationOrg) || 0;
    let isOrgOverride = false;
    
    if (manualOrgEvOverride > 0) {
        orgFutureEV = manualOrgEvOverride;
        isOrgOverride = true;
    } else if (company.valMetric === 'Revenue') {
        orgFutureEV = orgRevFinal * exitMultiple;
    } else if (company.valMetric === 'ARR') {
        orgFutureEV = orgArrFinal * exitMultiple;
    } else if (company.valMetric === 'EBITDA') {
        orgFutureEV = orgEbitdaFinal * exitMultiple;
    } else {
        orgFutureEV = currentEV * Math.pow(1 + growthRate / 100, pYears);
    }
    const orgFutureEquityValue = orgFutureEV + futureCash - futureDebt;

    // 3. Fundraise Projection
    const fundNewGrowth = Number(scenarios.fundraising.newGrowthRate) || 0;
    const fundRevFinal = currentRev * Math.pow(1 + fundNewGrowth / 100, pYears);
    const fundArrFinal = currentArr * Math.pow(1 + fundNewGrowth / 100, pYears);
    const fundEbitdaFinal = fundRevFinal * (targetEbitdaMargin / 100);
    
    let fundFutureEV = 0;
    const manualFundEvOverride = Number(scenarios.fundraising.manualExitValuation) || 0;
    let isFundOverride = false;

    if (manualFundEvOverride > 0) {
        fundFutureEV = manualFundEvOverride;
        isFundOverride = true;
    } else if (company.valMetric === 'Revenue') {
        fundFutureEV = fundRevFinal * exitMultiple;
    } else if (company.valMetric === 'ARR') {
        fundFutureEV = fundArrFinal * exitMultiple;
    } else if (company.valMetric === 'EBITDA') {
        fundFutureEV = fundEbitdaFinal * exitMultiple;
    } else {
        fundFutureEV = currentEV * Math.pow(1 + fundNewGrowth / 100, pYears);
    }
    const fundFutureEquityValue = fundFutureEV + futureCash - futureDebt;

    // Processar Rodadas de Captação e Secundária
    let postRaiseCapTable = capTable.map(p => ({ ...p, secondaryGross: 0, secondaryTax: 0, secondaryNet: 0 }));
    const activeRounds = scenarios.fundraising.rounds.filter(r => r.active);
    
    activeRounds.forEach(round => {
        const roundAmount = Number(round.amount) || 0;
        const roundPreMoney = Number(round.preMoney) || 0;
        const roundPoolIncrease = Number(round.optionPoolIncrease) || 0;
        const roundPrefMult = Number(round.prefMultiple) || 0;
        const roundSecPct = Number(round.secondaryPercent) || 0;

        if (roundSecPct > 0) {
            postRaiseCapTable = postRaiseCapTable.map(p => {
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

        postRaiseCapTable = postRaiseCapTable.map(p => ({
            ...p,
            ownership: ((Number(p.ownership) || 0) * dilutionFactor).toString()
        }));
        
        postRaiseCapTable.push({
            id: `new_inv_${round.id}`, name: `Investidor ${round.name}`, category: 'Investidor', 
            ownership: newInvestorPct.toString(), cost: roundAmount.toString(), 
            hasPref: true, prefAmount: roundAmount.toString(), 
            prefMultiple: roundPrefMult.toString(), isParticipating: false, isMainFounder: false,
            secondaryGross: 0, secondaryTax: 0, secondaryNet: 0
        });

        if (roundPoolIncrease > 0) {
            postRaiseCapTable.push({
                id: `new_pool_${round.id}`, name: `Pool (${round.name})`, category: 'Pool', 
                ownership: roundPoolIncrease.toString(), cost: '0', hasPref: false, prefAmount: '0', prefMultiple: '1', isParticipating: false, isMainFounder: false,
                secondaryGross: 0, secondaryTax: 0, secondaryNet: 0
            });
        }
    });

    let totalDividendsPool = 0;
    const divDistPct = Number(scenarios.dividends.distributePercentage) || 0;
    for (let i = 1; i <= pYears; i++) {
        const yearRev = currentRev * Math.pow(1 + growthRate / 100, i);
        const yearEbitda = yearRev * (targetEbitdaMargin / 100);
        if (yearEbitda > 0) {
            totalDividendsPool += yearEbitda * (divDistPct / 100);
        }
    }

    // --- WATERFALL FUNCTION ---
    const runWaterfall = (rawEqValue, table, divsPool = 0) => {
        const eqValue = Math.max(0, rawEqValue);
        const upPct = Number(scenarios.upfrontPercent) || 0;
        const eoPct = Number(scenarios.earnoutPercent) || 0;
        const eoProb = Number(scenarios.earnoutProbability) || 0;

        const totalUpfront = eqValue * (upPct / 100);
        const totalEarnout = eqValue * (eoPct / 100);
        const expectedEarnout = totalEarnout * (eoProb / 100);

        const results = table.map(p => {
            const ownership = Number(p.ownership) || 0;
            const pct = ownership / 100;
            let prefPayout = 0;
            const prefAmount = Number(p.prefAmount) || 0;
            const prefMultiple = Number(p.prefMultiple) || 0;

            if (p.hasPref) prefPayout = prefAmount * prefMultiple;

            const straightEquityUpfront = totalUpfront * pct;
            let finalUpfrontBruto = 0;

            if (p.hasPref) {
                 if (!p.isParticipating) {
                    finalUpfrontBruto = Math.max(prefPayout, straightEquityUpfront);
                 } else {
                     const poolAfterPrefs = Math.max(0, totalUpfront - table.reduce((sum, act) => sum + (act.hasPref ? (Number(act.prefAmount)||0) * (Number(act.prefMultiple)||0) : 0), 0));
                     finalUpfrontBruto = prefPayout + (poolAfterPrefs * pct);
                 }
            } else {
                const totalPrefsPaid = table.reduce((sum, act) => sum + (act.hasPref ? Math.max((Number(act.prefAmount)||0) * (Number(act.prefMultiple)||0), totalUpfront * ((Number(act.ownership)||0)/100)) : 0), 0);
                const poolForCommon = Math.max(0, totalUpfront - totalPrefsPaid);
                const totalCommonPct = table.filter(c => !c.hasPref).reduce((sum, c) => sum + ((Number(c.ownership)||0)/100), 0);
                if (totalCommonPct > 0) {
                     finalUpfrontBruto = poolForCommon * (pct / totalCommonPct);
                } else {
                     finalUpfrontBruto = 0;
                }
            }

            const earnoutEsperado = expectedEarnout * pct;
            const divsBruto = divsPool * pct;
            const divsLiquido = divsBruto * 0.85;

            const cost = Number(p.cost) || 0;
            const upfrontGain = Math.max(0, finalUpfrontBruto - cost);
            const upfrontTax = calculateBRTax(upfrontGain);
            const upfrontLiquido = finalUpfrontBruto - upfrontTax;

            const earnoutTax = calculateBRTax(earnoutEsperado); 
            const earnoutLiquido = earnoutEsperado - earnoutTax;

            const secondaryGross = p.secondaryGross || 0;
            const secondaryTax = p.secondaryTax || 0;
            const secondaryNet = p.secondaryNet || 0;

            const totalTaxPaid = upfrontTax + earnoutTax + secondaryTax + (divsBruto - divsLiquido);
            const totalLiquido = upfrontLiquido + earnoutLiquido + divsLiquido + secondaryNet;

            return {
                ...p, upfrontBruto: finalUpfrontBruto, upfrontTax, upfrontLiquido,
                earnoutEsperado, earnoutTax, earnoutLiquido, divsLiquido,
                secondaryGross, secondaryTax, secondaryNet, totalTaxPaid, totalLiquido
            };
        });

        return results;
    };

    const resToday = runWaterfall(currentEquityValue, capTable);
    const resOrg = runWaterfall(orgFutureEquityValue, capTable);
    const resFund = runWaterfall(fundFutureEquityValue, postRaiseCapTable);
    const resDivs = runWaterfall(orgFutureEquityValue, capTable, totalDividendsPool);

    const fToday = resToday.find(r => r.id === mainFounder.id);
    const fOrg = resOrg.find(r => r.id === mainFounder.id);
    const fFund = resFund.find(r => r.id === mainFounder.id) || { totalLiquido: 0 };
    const fDivs = resDivs.find(r => r.id === mainFounder.id);

    const safeYield = Number(company.safeYieldRate) || 0;
    const todayYieldedTotal = fToday.totalLiquido * Math.pow(1 + safeYield / 100, pYears);
    const todayYieldedInterest = todayYieldedTotal - fToday.totalLiquido;

    // --- EXACT BREAK-EVEN CALCULATION ---
    const findEvForTarget = (targetNet, tableSnapshot, divsPool = 0) => {
        let low = 0;
        let high = 5000000000; 
        let bestEv = 0;
        for(let i=0; i<40; i++) { 
            let mid = (low + high) / 2;
            let eqVal = mid + futureCash - futureDebt;
            let res = runWaterfall(eqVal, tableSnapshot, divsPool);
            let fNet = res.find(r => r.id === mainFounder.id)?.totalLiquido || 0;
            if (fNet < targetNet) { low = mid; } 
            else { high = mid; bestEv = mid; }
        }
        return bestEv;
    };

    const breakEvenEvOrgCdi = findEvForTarget(todayYieldedTotal, capTable, 0);
    const breakEvenEvFundCdi = findEvForTarget(todayYieldedTotal, postRaiseCapTable, 0);
    const breakEvenEvFundVsOrg = findEvForTarget(fOrg.totalLiquido, postRaiseCapTable, 0);

    const rawEvPoints = [currentEV, breakEvenEvOrgCdi, breakEvenEvFundCdi, breakEvenEvFundVsOrg, orgFutureEV, fundFutureEV];
    const sortedEvPoints = [...new Set(rawEvPoints.filter(p => p > 0).map(p => Math.round(p/10000)*10000))].sort((a,b)=>a-b);
    
    const matrixEvs = [...sortedEvPoints];
    const maxEvPlot = matrixEvs[matrixEvs.length-1] || currentEV;
    if (maxEvPlot > 0) {
        matrixEvs.push(maxEvPlot * 1.25);
        matrixEvs.push(maxEvPlot * 1.50);
    }
    const finalMatrixEvs = [...new Set(matrixEvs.map(p => Math.round(p/10000)*10000))].sort((a,b)=>a-b);

    const sensitivityMatrix = finalMatrixEvs.map(ev => {
        let eqVal = ev + futureCash - futureDebt;
        let resOrgMat = runWaterfall(eqVal, capTable, 0);
        let resFundMat = runWaterfall(eqVal, postRaiseCapTable, 0);
        let netOrg = resOrgMat.find(r => r.id === mainFounder.id)?.totalLiquido || 0;
        let netFund = resFundMat.find(r => r.id === mainFounder.id)?.totalLiquido || 0;
        
        let winner = 'CDI / Venda Hoje';
        if (netOrg >= todayYieldedTotal && netOrg >= netFund) winner = 'Orgânico';
        if (netFund >= todayYieldedTotal && netFund > netOrg) winner = 'Captação';

        return {
            ev, netOrg, netFund, winner,
            isCurrentOrg: Math.abs(ev - orgFutureEV) < 50000,
            isCurrentFund: Math.abs(ev - fundFutureEV) < 50000,
            isBreakEvenCdiOrg: Math.abs(ev - breakEvenEvOrgCdi) < 50000,
            isBreakEvenCdiFund: Math.abs(ev - breakEvenEvFundCdi) < 50000,
        };
    });

    return {
        ev: { today: currentEV, org: orgFutureEV, fund: fundFutureEV },
        eq: { today: currentEquityValue, org: orgFutureEquityValue, fund: fundFutureEquityValue },
        founder: { today: fToday, org: fOrg, fund: fFund, divs: fDivs },
        cdi: { total: todayYieldedTotal, interest: todayYieldedInterest },
        breakEvens: { orgCdi: breakEvenEvOrgCdi, fundCdi: breakEvenEvFundCdi, fundOrg: breakEvenEvFundVsOrg },
        sensitivityMatrix,
        activeRoundsCount: activeRounds.length,
        flags: { isOrgOverride, isFundOverride }
    };

  }, [capTable, company, scenarios, isCapTableValid]);

  // --- UI ACTIONS ---
  const handleCopySlide = () => {
    if (!results) return;
    const text = `🎯 Resumo Estratégico: ${company.name} (${mainFounder.name})

1️⃣ Venda Hoje + CDI (EV: ${formatCurrency(results.ev.today)})
• Total Acumulado em ${company.projectionYears} anos: ${formatCurrency(results.cdi.total)}
   └ Venda Líquida Hoje: ${formatCurrency(results.founder.today.totalLiquido)}
   └ Rendimento CDI (${company.safeYieldRate}% a.a.): +${formatCurrency(results.cdi.interest)}

2️⃣ Crescimento Orgânico em 5 Anos (EV: ${formatCurrency(results.ev.org)})
• Líquido Esperado: ${formatCurrency(results.founder.org.totalLiquido)}

3️⃣ Cenário com Captação (EV: ${formatCurrency(results.ev.fund)})
${results.activeRoundsCount > 0 ? `• Rodadas Simuladas: ${results.activeRoundsCount}` : '• Nenhuma rodada ativada.'}
• Líquido Esperado (Total): ${formatCurrency(results.founder.fund.totalLiquido)}
${results.founder.fund.secondaryNet > 0 ? `  └ Inclui ${formatCurrency(results.founder.fund.secondaryNet)} de Secundária (já líquidos).` : ''}

🔥 BREAK-EVEN E SENSIBILIDADE
• Para a Captação superar o CDI: A empresa precisa ser vendida por +${formatCurrency(results.breakEvens.fundCdi)}
• Para a Captação superar o Orgânico: A empresa precisa ser vendida por +${formatCurrency(results.breakEvens.fundOrg)}

*Nota: Todos os valores descontam Imposto de Renda progressivo e aplicam ${scenarios.earnoutProbability}% de prob. no Earn-out.*`;
    
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      setScenarios({ ...scenarios, fundraising: { ...scenarios.fundraising, rounds: newRounds } });
  };

  const renderTabButton = (id, label, icon) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        activeTab === id 
          ? 'border-blue-600 text-blue-600' 
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-slate-800 font-sans">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
                <Calculator className="w-6 h-6 text-white" />
            </div>
            <div>
                <h1 className="text-xl font-bold text-slate-900">Founder Outcome Calculator</h1>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">ACE Advisors V4 (Overrides Blindados)</p>
            </div>
        </div>
      </header>

      <div className="bg-white px-6 border-b border-gray-200">
        <nav className="flex gap-4">
          {renderTabButton('captable', '1. Cap Table', <PieChart className="w-4 h-4" />)}
          {renderTabButton('company', '2. Finanças & Projeções', <TrendingUp className="w-4 h-4" />)}
          {renderTabButton('scenarios', '3. Cenários Múltiplos', <Briefcase className="w-4 h-4" />)}
          {renderTabButton('results', '4. Resultados & Análises', <DollarSign className="w-4 h-4" />)}
        </nav>
      </div>

      {!isCapTableValid && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 m-6 rounded-r-md flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
                <h3 className="text-sm font-bold text-amber-800">Atenção ao Cap Table</h3>
                <p className="text-sm text-amber-700">A soma das participações está em {totalOwnership.toFixed(2)}%. Ajuste para somar exatos 100%.</p>
            </div>
        </div>
      )}

      <main className="p-6 max-w-7xl mx-auto">
        
        {/* --- TAB: CAP TABLE --- */}
        {activeTab === 'captable' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Cap Table Atual</h2>
                    <p className="text-xs text-slate-500 mt-1">O "Custo Aquisição" será usado para abater a base de cálculo do Imposto de Renda.</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${isCapTableValid ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                    Total: {totalOwnership.toFixed(2)}%
                </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
                  <tr>
                    <th className="px-4 py-3">Participante</th>
                    <th className="px-4 py-3 w-32">Categoria</th>
                    <th className="px-4 py-3 w-28">Partic. (%)</th>
                    <th className="px-4 py-3 w-32">Custo Base (R$)</th>
                    <th className="px-4 py-3 text-center">Pref?</th>
                    <th className="px-4 py-3 w-32">Base Pref (R$)</th>
                    <th className="px-4 py-3 w-20">Mult.</th>
                    <th className="px-4 py-3 text-center">Partic.?</th>
                    <th className="px-4 py-3 text-center">Referência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {capTable.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-blue-50/50">
                      <td className="px-4 py-2"><input type="text" value={p.name} onChange={e => updateCapTable(idx, 'name', e.target.value)} className="w-full bg-transparent border-b border-transparent focus:border-blue-500 py-1" /></td>
                      <td className="px-4 py-2">
                        <select value={p.category} onChange={e => updateCapTable(idx, 'category', e.target.value)} className="w-full bg-transparent border-b border-transparent focus:border-blue-500 py-1">
                            <option>Founder</option><option>Investidor</option><option>Pool</option><option>Outros</option>
                        </select>
                      </td>
                      <td className="px-4 py-2"><input type="number" value={p.ownership} onChange={e => updateCapTable(idx, 'ownership', e.target.value)} className="w-full font-medium bg-transparent border-b border-transparent focus:border-blue-500 py-1" /></td>
                      <td className="px-4 py-2"><input type="number" value={p.cost} onChange={e => updateCapTable(idx, 'cost', e.target.value)} className="w-full bg-transparent border-b border-transparent focus:border-blue-500 py-1" /></td>
                      <td className="px-4 py-2 text-center"><input type="checkbox" checked={p.hasPref} onChange={e => updateCapTable(idx, 'hasPref', e.target.checked)} className="w-4 h-4 text-blue-600" /></td>
                      <td className="px-4 py-2"><input type="number" value={p.prefAmount} disabled={!p.hasPref} onChange={e => updateCapTable(idx, 'prefAmount', e.target.value)} className="w-full bg-transparent border-b border-transparent focus:border-blue-500 py-1 disabled:opacity-30" /></td>
                      <td className="px-4 py-2"><input type="number" step="0.5" value={p.prefMultiple} disabled={!p.hasPref} onChange={e => updateCapTable(idx, 'prefMultiple', e.target.value)} className="w-full bg-transparent border-b border-transparent focus:border-blue-500 py-1 disabled:opacity-30" /></td>
                      <td className="px-4 py-2 text-center"><input type="checkbox" checked={p.isParticipating} disabled={!p.hasPref} onChange={e => updateCapTable(idx, 'isParticipating', e.target.checked)} className="w-4 h-4 text-blue-600 disabled:opacity-30" /></td>
                      <td className="px-4 py-2 text-center"><input type="radio" name="mainFounder" checked={p.isMainFounder} onChange={() => { const newCT = capTable.map(c => ({...c, isMainFounder: false})); newCT[idx].isMainFounder = true; setCapTable(newCT); }} className="w-4 h-4 text-blue-600" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TAB: COMPANY --- */}
        {activeTab === 'company' && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Métricas e Valuation HOJE</h2>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Receita Anual</label><input type="number" value={company.revenue} onChange={e => setCompany({...company, revenue: e.target.value})} className="w-full p-2 border border-gray-300 rounded" /></div>
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">ARR</label><input type="number" value={company.arr} onChange={e => setCompany({...company, arr: e.target.value})} className="w-full p-2 border border-gray-300 rounded" /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">EBITDA Atual</label><input type="number" value={company.ebitda} onChange={e => setCompany({...company, ebitda: e.target.value})} className="w-full p-2 border border-gray-300 rounded" /></div>
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Métrica Valuation</label><select value={company.valMetric} onChange={e => setCompany({...company, valMetric: e.target.value})} className="w-full p-2 border border-gray-300 rounded"><option>ARR</option><option>Revenue</option><option>EBITDA</option><option>Manual</option></select></div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Múltiplo Atual</label><input type="number" step="0.5" value={company.currentMultiple} onChange={e => setCompany({...company, currentMultiple: e.target.value})} className="w-full p-2 border border-gray-300 rounded disabled:bg-gray-100" disabled={company.valMetric==='Manual'} /></div>
                            {company.valMetric === 'Manual' && (
                                <div>
                                    <label className="block text-xs font-bold text-indigo-600 uppercase mb-1">Valuation HOJE Manual (R$)</label>
                                    <input type="number" value={company.manualValuation} onChange={e => setCompany({...company, manualValuation: e.target.value})} className="w-full p-2 border border-indigo-300 bg-indigo-50 rounded" title="Será o valor de venda HOJE. A projeção de 5 anos crescerá em cima deste valor." />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Projeção Orgânica ({company.projectionYears} Anos)</h2>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Crescimento Orgânico a.a. (%)</label><input type="number" value={company.growthRate} onChange={e => setCompany({...company, growthRate: e.target.value})} className="w-full p-2 border border-gray-300 rounded" /></div>
                            <div><label className="block text-xs font-bold text-indigo-600 uppercase mb-1">CDI Líquido a.a. (%)</label><input type="number" value={company.safeYieldRate} onChange={e => setCompany({...company, safeYieldRate: e.target.value})} className="w-full p-2 border border-indigo-300 rounded bg-indigo-50" title="Usado para simular o dinheiro investido no banco." /></div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Margem EBITDA Futura</label><input type="number" value={company.targetEbitdaMargin} onChange={e => setCompany({...company, targetEbitdaMargin: e.target.value})} className="w-full p-2 border border-gray-300 rounded" /></div>
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Múltiplo Saída</label><input type="number" step="0.5" value={company.exitMultiple} onChange={e => setCompany({...company, exitMultiple: e.target.value})} className="w-full p-2 border border-gray-300 rounded" disabled={Number(company.manualExitValuationOrg) > 0} /></div>
                            <div>
                                <label className="block text-[10px] font-bold text-purple-600 uppercase mb-1">Valuation SAÍDA Manual (R$)</label>
                                <input type="number" value={company.manualExitValuationOrg} onChange={e => setCompany({...company, manualExitValuationOrg: e.target.value})} className="w-full p-2 border border-purple-300 bg-purple-50 rounded placeholder-purple-400" placeholder="Sobrescreve a conta" title="Força este valor exato como o EV de venda daqui a 5 anos" />
                                <p className="text-[9px] text-gray-500 mt-1 leading-tight">Preencha apenas se quiser <strong>ignorar o múltiplo</strong> e fixar o valor exato de venda da empresa daqui a 5 anos.</p>
                            </div>
                        </div>
                    </div>
                </div>
             </div>
        )}

        {/* --- TAB: SCENARIOS --- */}
        {activeTab === 'scenarios' && (
          <div className="space-y-6">
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                 <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Como será o pagamento da Saída (Exit)</h2>
                 <div className="grid grid-cols-3 gap-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">% Pago à Vista (Upfront)</label>
                        <input type="number" value={scenarios.upfrontPercent} onChange={e => setScenarios({...scenarios, upfrontPercent: e.target.value, earnoutPercent: (100 - (Number(e.target.value) || 0)).toString()})} className="w-full p-2 border border-gray-300 rounded" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">% Condicionado (Earn-out)</label>
                        <input type="number" value={scenarios.earnoutPercent} disabled className="w-full p-2 border border-gray-300 rounded bg-gray-50 font-semibold" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Probabilidade de receber Earn-out</label>
                        <input type="number" value={scenarios.earnoutProbability} onChange={e => setScenarios({...scenarios, earnoutProbability: e.target.value})} className="w-full p-2 border border-gray-300 rounded" />
                    </div>
                 </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-6">
                <div className="flex justify-between items-center mb-4 border-b border-blue-100 pb-2">
                    <h2 className="text-lg font-bold text-blue-800">Cenário: Captação Acelerada (Série A, B e C)</h2>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-bold text-blue-800">Crescimento acelerado a.a (%):</label>
                            <input type="number" value={scenarios.fundraising.newGrowthRate} onChange={e => setScenarios({...scenarios, fundraising: {...scenarios.fundraising, newGrowthRate: e.target.value}})} className="w-20 p-1.5 border border-blue-300 rounded text-center" />
                        </div>
                        <div className="flex items-center gap-2 relative">
                            <label className="text-sm font-bold text-purple-700">Valuation Saída Manual (R$):</label>
                            <div>
                                <input type="number" value={scenarios.fundraising.manualExitValuation} onChange={e => setScenarios({...scenarios, fundraising: {...scenarios.fundraising, manualExitValuation: e.target.value}})} className="w-32 p-1.5 border border-purple-300 bg-purple-50 rounded text-center" placeholder="Opcional" title="Sobrescreve Múltiplos e projeta este EV exato" />
                                <p className="text-[9px] text-gray-500 mt-0.5 leading-tight absolute">Ignora múltiplo de saída.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {scenarios.fundraising.rounds.map((round) => (
                        <div key={round.id} className={`border p-4 rounded-xl transition-all ${round.active ? 'border-blue-400 bg-blue-50/20 shadow-md' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-800">{round.name}</h3>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="checkbox" checked={round.active} onChange={e => updateRound(round.id, 'active', e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                                    Ativar
                                </label>
                            </div>
                            
                            <div className={`space-y-3 ${!round.active && 'pointer-events-none'}`}>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Valor Captado p/ Caixa</label>
                                    <input type="number" value={round.amount} onChange={e => updateRound(round.id, 'amount', e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Valuation Pre-Money</label>
                                    <input type="number" value={round.preMoney} onChange={e => updateRound(round.id, 'preMoney', e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Liq. Pref (Mult)</label>
                                        <input type="number" step="0.5" value={round.prefMultiple} onChange={e => updateRound(round.id, 'prefMultiple', e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Pool Opções (+%)</label>
                                        <input type="number" value={round.optionPoolIncrease} onChange={e => updateRound(round.id, 'optionPoolIncrease', e.target.value)} className="w-full p-2 border border-gray-300 rounded text-sm" />
                                    </div>
                                </div>
                                <div className="pt-2 border-t border-gray-200 mt-2">
                                    <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1 flex items-center gap-1">
                                        <DollarSign className="w-3 h-3"/> Venda Secundária do Founder (%)
                                    </label>
                                    <div className="flex gap-2 items-center">
                                        <input type="number" step="0.5" value={round.secondaryPercent} onChange={e => updateRound(round.id, 'secondaryPercent', e.target.value)} className="w-full p-2 border border-indigo-300 rounded text-sm bg-indigo-50 focus:bg-white" />
                                        <span className="text-[10px] leading-tight text-gray-500 w-full">% da própria posição vendida no Pre-Money</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-6">
                <h2 className="text-lg font-bold text-emerald-800 mb-2 border-b border-emerald-100 pb-2">Cenário: Distribuição de Dividendos</h2>
                <div className="flex items-center gap-4">
                    <div className="flex-1 text-sm text-slate-600">Simula a empresa crescendo organicamente, distribuindo caixa para os sócios antes da venda (Taxado a 15% como proxy).</div>
                    <div>
                        <label className="block text-xs font-bold text-emerald-600 uppercase mb-1">% EBITDA Anual Distribuído</label>
                        <input type="number" value={scenarios.dividends.distributePercentage} onChange={e => setScenarios({...scenarios, dividends: {...scenarios.dividends, distributePercentage: e.target.value}})} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500" />
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* --- TAB: RESULTS --- */}
        {activeTab === 'results' && results && (
          <div className="space-y-6">
            
            <div className="bg-slate-900 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
                <h2 className="text-2xl font-bold mb-2">Outcome Líquido Final: {mainFounder.name}</h2>
                <p className="text-slate-300 max-w-2xl text-sm mb-6">
                    Valores líquidos projetados (já descontando Imposto de Renda de 15 a 22,5%).
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
                    
                    <div className="bg-indigo-900/40 rounded-lg p-4 border border-indigo-500 shadow-lg">
                        <div className="text-xs text-indigo-200 font-bold uppercase mb-1 tracking-wider">Venda Hoje + CDI (5 anos)</div>
                        <div className="text-3xl font-bold text-white mb-3">{formatCurrency(results.cdi.total)}</div>
                        <div className="space-y-1 mt-2 text-xs border-t border-indigo-700/50 pt-2">
                            <div className="flex justify-between items-center">
                                <span className="text-indigo-300">Venda Líquida Hoje:</span>
                                <span className="font-semibold text-white">{formatCurrency(results.founder.today.totalLiquido)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-indigo-300">Rendimento Acumulado:</span>
                                <span className="font-semibold text-emerald-400">+{formatCurrency(results.cdi.interest)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-800/80 rounded-lg p-4 border border-slate-700 flex flex-col justify-between relative">
                        <div>
                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Orgânico (5 anos)</div>
                            <div className="text-2xl font-bold text-emerald-400">{formatCurrency(results.founder.org.totalLiquido)}</div>
                        </div>
                        <div className="text-xs text-slate-500 mt-2">
                            Valuation Saída: {formatCurrency(results.ev.org)}
                            {results.flags.isOrgOverride && <span className="block text-[10px] text-purple-400 font-bold mt-1">⚠️ OVERRIDE: Valuation Fixo</span>}
                        </div>
                    </div>
                    
                    <div className="bg-blue-900/40 rounded-lg p-4 border border-blue-500 relative flex flex-col justify-between">
                        {results.founder.fund.totalLiquido > Math.max(results.founder.org.totalLiquido, results.cdi.total) && (
                             <div className="absolute -top-3 -right-2 bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg">MAIOR VALOR LÍQUIDO</div>
                        )}
                        <div>
                            <div className="text-xs text-blue-200 font-bold uppercase mb-1">Captação ({results.activeRoundsCount} Rodadas)</div>
                            <div className="text-2xl font-bold text-blue-400">{formatCurrency(results.founder.fund.totalLiquido)}</div>
                        </div>
                        <div className="text-xs text-slate-500 mt-2">
                            Valuation Saída: {formatCurrency(results.ev.fund)}
                            {results.flags.isFundOverride && <span className="block text-[10px] text-purple-400 font-bold mt-1">⚠️ OVERRIDE: Valuation Fixo</span>}
                        </div>
                    </div>
                    
                    <div className="bg-slate-800/80 rounded-lg p-4 border border-slate-700 flex flex-col justify-between">
                        <div>
                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Dividendos + Venda</div>
                            <div className="text-2xl font-bold text-purple-400">{formatCurrency(results.founder.divs.totalLiquido)}</div>
                        </div>
                        <div className="text-xs text-slate-500 mt-2">Valuation Saída: {formatCurrency(results.ev.org)}</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Info className="w-5 h-5 text-blue-500"/> Leitura Estratégica Automática</h3>
                        <button onClick={handleCopySlide} className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100 transition-colors">
                            {copied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copiar para Slide
                        </button>
                    </div>
                    
                    <div className="space-y-4 text-sm text-slate-700 flex-grow">
                        <p className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5"/>
                            <span>A venda imediata assegura <strong>{formatCurrency(results.founder.today.totalLiquido)}</strong> líquidos. Se você colocar esse dinheiro no banco a {company.safeYieldRate}% a.a., ele se transformará num patrimônio de <strong>{formatCurrency(results.cdi.total)}</strong> ao final de {company.projectionYears} anos, com zero risco de execução na empresa.</span>
                        </p>
                        
                        <p className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5"/>
                            <span>
                                No cenário de Captação, a participação do founder cai para <strong>{formatPercent(results.founder.fund.ownership)}</strong>. 
                                {results.founder.fund.totalLiquido > Math.max(results.founder.org.totalLiquido, results.cdi.total)
                                    ? <> Contudo, como neste cenário a saída está projetada em <strong>{formatCurrency(results.ev.fund)}</strong>, o ganho final supera a perda de participação. A captação consagra-se como o caminho mais lucrativo.</> 
                                    : <> <strong>A diluição pesa demais.</strong> Mesmo assumindo uma saída de <strong>{formatCurrency(results.ev.fund)}</strong> neste cenário, o founder sairia com mais dinheiro optando por crescer organicamente ou aplicando no CDI.</>
                                }
                            </span>
                        </p>

                        {results.founder.fund.secondaryNet > 0 && (
                            <div className="bg-indigo-50 p-3 rounded border border-indigo-100 flex items-start gap-2">
                                <DollarSign className="w-5 h-5 text-indigo-500 flex-shrink-0"/>
                                <span>As rodadas secundárias removeram <strong>{formatCurrency(results.founder.fund.secondaryNet)} líquidos</strong> da mesa durante o processo, blindando parte do seu patrimônio antes do Exit final. Impostos de {formatCurrency(results.founder.fund.secondaryTax)} foram recolhidos nessas operações.</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Composição Tributária: Captação + Venda</h3>
                    
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center py-1">
                            <span className="text-slate-500">1. Pedaço Upfront Bruto no Exit</span>
                            <span className="font-semibold text-slate-800">{formatCurrency(results.founder.fund.upfrontBruto)}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 text-red-500">
                            <span className="pl-4">↳ IR Ganho de Capital Upfront</span>
                            <span>- {formatCurrency(results.founder.fund.upfrontTax)}</span>
                        </div>

                        <div className="flex justify-between items-center py-1 mt-2 border-t border-gray-100 pt-2">
                            <span className="text-slate-500">2. Earn-out Bruto (Ajustado pela Probabilidade)</span>
                            <span className="font-semibold text-slate-800">{formatCurrency(results.founder.fund.earnoutEsperado)}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 text-red-500">
                            <span className="pl-4">↳ IR Ganho de Capital Earn-out</span>
                            <span>- {formatCurrency(results.founder.fund.earnoutTax)}</span>
                        </div>

                        <div className="flex justify-between items-center py-1 mt-2 border-t border-gray-100 pt-2 text-indigo-700">
                            <span className="font-medium">3. Secundárias Acumuladas Brutas</span>
                            <span className="font-medium">{formatCurrency(results.founder.fund.secondaryGross)}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 text-red-500">
                            <span className="pl-4">↳ IR Ganho de Capital Secundárias</span>
                            <span>- {formatCurrency(results.founder.fund.secondaryTax)}</span>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t-2 border-slate-800">
                            <div className="flex justify-between items-center py-1 font-bold text-red-600 bg-red-50 px-2 rounded">
                                <span>Total Leão (Impostos Pagos)</span>
                                <span>- {formatCurrency(results.founder.fund.totalTaxPaid)}</span>
                            </div>
                            <div className="flex justify-between items-center py-3 mt-2 bg-slate-900 rounded px-3 font-bold text-xl text-emerald-400 shadow-inner">
                                <span>Total Líquido no seu Bolso</span>
                                <span>{formatCurrency(results.founder.fund.totalLiquido)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* NOVA SESSÃO: ANÁLISE DE SENSIBILIDADE E BREAK-EVEN */}
            <div className="bg-white rounded-xl shadow-sm border border-indigo-200 overflow-hidden">
                <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-200">
                    <div className="flex items-center gap-3">
                        <Target className="w-6 h-6 text-indigo-600" />
                        <h2 className="text-xl font-bold text-indigo-900">Análise de Sensibilidade & Break-Even do Fundador</h2>
                    </div>
                    
                    <div className="mt-4 text-sm text-indigo-900 bg-white p-4 rounded-lg border border-indigo-100 shadow-sm">
                        <p className="mb-2">Esta matriz compara os caminhos focando no bolso de <strong>{mainFounder.name}</strong>, que hoje detém <strong>{formatPercent(mainFounder.ownership)}</strong> da empresa.</p>
                        <ul className="list-disc pl-5 space-y-1.5 text-xs text-indigo-800">
                            <li><strong>Cenário Orgânico:</strong> Assume que a empresa vai crescer <strong>{company.growthRate}% a.a.</strong> sem diluição adicional.</li>
                            <li><strong>Cenário Captação:</strong> Assume crescimento acelerado de <strong>{scenarios.fundraising.newGrowthRate}% a.a.</strong> e diluição de {results.activeRoundsCount} rodada(s). {results.founder.fund.secondaryNet > 0 ? <span className="font-bold text-emerald-600">A liquidez antecipada de R$ {formatCurrency(results.founder.fund.secondaryNet)} em Secundárias já está somada aos totais abaixo.</span> : ''}</li>
                            <li><strong>Cenário Base (CDI / Venda Hoje):</strong> Equivale a <strong>{formatCurrency(results.cdi.total)}</strong>. Este é o valor que o fundador teria daqui a 5 anos se vendesse a empresa HOJE e deixasse o dinheiro render a {company.safeYieldRate}% a.a. Trabalhar mais 5 anos só faz sentido se o resultado superar essa linha.</li>
                        </ul>
                    </div>
                </div>
                
                <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Metas exatas de Break-Even */}
                    <div className="space-y-6">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b pb-2">Valuation de Saída Mínimo (Hurdle)</h3>
                        <p className="text-xs text-slate-500 -mt-2 mb-4 leading-tight">Nota: O Break-Even é um <strong>ponto de equilíbrio matemático independente das premissas de Valuation Manual</strong> que você preencheu acima.</p>
                        
                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
                            <p className="text-xs font-bold text-slate-500 mb-2">Para empatar com "Venda Hoje + CDI"</p>
                            <div className="space-y-3">
                                <div>
                                    <span className="text-xs text-slate-500 block">Se a empresa crescer Organicamante:</span>
                                    <span className="text-lg font-bold text-emerald-600">{formatCurrency(results.breakEvens.orgCdi)}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-slate-500 block">Se a empresa fizer Captação (Série A, B...):</span>
                                    <span className="text-lg font-bold text-blue-600">{formatCurrency(results.breakEvens.fundCdi)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                            <p className="text-xs font-bold text-blue-800 mb-2">Para a Captação compensar a diluição Orgânica</p>
                            <div>
                                <span className="text-xs text-blue-600 block">Mínimo que a empresa captada precisa ser vendida:</span>
                                <span className="text-xl font-bold text-blue-700">{formatCurrency(results.breakEvens.fundOrg)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Tabela de Sensibilidade Visual */}
                    <div className="lg:col-span-2">
                        <div className="flex items-center gap-2 mb-4 border-b pb-2">
                            <TableIcon className="w-4 h-4 text-slate-500" />
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Matriz de Sensibilidade (Valuation vs. Bolso)</h3>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3">Se a empresa for vendida por (EV)...</th>
                                        <th className="px-4 py-3 text-right">Líquido no Orgânico</th>
                                        <th className="px-4 py-3 text-right border-l">Líquido na Captação</th>
                                        <th className="px-4 py-3 text-center">Cenário Vencedor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {results.sensitivityMatrix.map((row, i) => (
                                        <tr key={i} className={`hover:bg-slate-50 ${row.isCurrentOrg || row.isCurrentFund ? 'bg-amber-50/30' : ''}`}>
                                            <td className="px-4 py-3 font-semibold text-slate-800 flex items-center gap-2">
                                                {formatCurrency(row.ev)}
                                                {row.isCurrentOrg && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">Projeção Orgânica</span>}
                                                {row.isCurrentFund && <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">Projeção Captação</span>}
                                                {row.isBreakEvenCdiOrg && <span className="text-[9px] border border-slate-300 text-slate-500 px-1.5 py-0.5 rounded font-bold">Empata CDI (Org)</span>}
                                                {row.isBreakEvenCdiFund && <span className="text-[9px] border border-slate-300 text-slate-500 px-1.5 py-0.5 rounded font-bold">Empata CDI (Capt)</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatCurrency(row.netOrg)}</td>
                                            <td className="px-4 py-3 text-right font-medium text-blue-600 border-l">{formatCurrency(row.netFund)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                    row.winner === 'Orgânico' ? 'bg-emerald-100 text-emerald-700' :
                                                    row.winner === 'Captação' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-indigo-100 text-indigo-700'
                                                }`}>
                                                    {row.winner}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-xs text-slate-400 mt-3 text-right">* O vencedor é comparado contra R$ {formatCurrency(results.cdi.total)} (Venda Hoje + CDI).</p>
                    </div>
                </div>
            </div>
            
          </div>
        )}

      </main>
    </div>
  );
}