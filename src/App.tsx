import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  ExternalLink,
  FileText,
  Filter,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { SAMPLE_MOROCCO_JOBS } from './scraper/scraper.ts';
import { prefilterJob } from './matching/prefilter.ts';

interface SimulatedEvaluation {
  id: string;
  title: string;
  employer: string;
  location: string;
  url: string;
  prefilterPassed: boolean;
  prefilterReason: string;
  decision?: 'match' | 'maybe' | 'reject';
  category?: 'technicien_specialise' | 'it_general' | 'both' | 'irrelevant';
  confidence?: number;
  reasons?: string;
  qualification_assessment?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'simulator' | 'criteria' | 'guide'>('overview');
  const [selectedModel, setSelectedModel] = useState<string>('openrouter/free');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResults, setSimulationResults] = useState<SimulatedEvaluation[]>([]);
  const [filterDecision, setFilterDecision] = useState<'all' | 'match' | 'maybe' | 'reject'>('all');

  const runSimulation = () => {
    setIsSimulating(true);

    setTimeout(() => {
      const results: SimulatedEvaluation[] = SAMPLE_MOROCCO_JOBS.map((job) => {
        const pre = prefilterJob(job);
        if (!pre.passed) {
          return {
            id: job.id,
            title: job.title,
            employer: job.employer,
            location: job.location,
            url: job.url,
            prefilterPassed: false,
            prefilterReason: pre.reason,
            decision: 'reject',
            category: 'irrelevant',
            confidence: 96,
            reasons: 'Non-IT occupation filtered prior to model inference to protect free quota.',
            qualification_assessment: 'Non-IT sector qualification',
          };
        }

        // Realistic heuristic decision simulation for verified model
        if (job.id.includes('tech-01')) {
          return {
            id: job.id,
            title: job.title,
            employer: job.employer,
            location: job.location,
            url: job.url,
            prefilterPassed: true,
            prefilterReason: pre.reason,
            decision: 'match',
            category: 'technicien_specialise',
            confidence: 92,
            reasons: 'Concours de Technicien 3ème grade (Échelle 9) ciblant explicitement le DTS Informatique / Réseaux.',
            qualification_assessment: 'Bac+2 DTS OFPPT / ISTA / DUT / BTS',
          };
        } else if (job.id.includes('ingenieur-it')) {
          return {
            id: job.id,
            title: job.title,
            employer: job.employer,
            location: job.location,
            url: job.url,
            prefilterPassed: true,
            prefilterReason: pre.reason,
            decision: 'match',
            category: 'it_general',
            confidence: 95,
            reasons: 'Poste d’Ingénieur d’État 1er grade en génie logiciel et architecture cloud.',
            qualification_assessment: 'Bac+5 Ingénieur d’État / Master IT',
          };
        } else if (job.id.includes('developer-03')) {
          return {
            id: job.id,
            title: job.title,
            employer: job.employer,
            location: job.location,
            url: job.url,
            prefilterPassed: true,
            prefilterReason: pre.reason,
            decision: 'match',
            category: 'both',
            confidence: 88,
            reasons: 'Offre privée Fullstack (Node/React) acceptant Bac+2 avec expérience ou Bac+5.',
            qualification_assessment: 'Bac+2 (DTS) à Bac+5',
          };
        } else {
          return {
            id: job.id,
            title: job.title,
            employer: job.employer,
            location: job.location,
            url: job.url,
            prefilterPassed: true,
            prefilterReason: pre.reason,
            decision: 'maybe',
            category: 'both',
            confidence: 55,
            reasons: 'Poste administratif avec volet numérisation et archivage électronique sans cahier des charges IT précis.',
            qualification_assessment: 'Bac+2 ou Bac+3',
          };
        }
      });

      setSimulationResults(results);
      setIsSimulating(false);
    }, 600);
  };

  const filteredJobs = simulationResults.filter((j) => {
    if (filterDecision === 'all') return true;
    return j.decision === filterDecision;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl shadow-inner">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  Morocco IT Job Monitoring Agent
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  OpenRouter Free Tier ($0/mo)
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Autonomous Moroccan IT & Concours Monitor • Telegram Alerting • Zero Paid Fallbacks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <Brain className="w-3.5 h-3.5 text-indigo-400" />
              <span>Model: <strong className="text-slate-200">{selectedModel}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Free-Tier Protected</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-800 bg-slate-900/40 px-6">
        <div className="max-w-7xl mx-auto flex gap-6 text-sm">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-1 border-b-2 font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            Dashboard & Architecture
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`py-3 px-1 border-b-2 font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'simulator'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="w-4 h-4" />
            Evaluation Simulator
          </button>
          <button
            onClick={() => setActiveTab('criteria')}
            className={`py-3 px-1 border-b-2 font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'criteria'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            Matching Criteria
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`py-3 px-1 border-b-2 font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'guide'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Setup & Deployment Guide
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>AI Inference Provider</span>
                  <Brain className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="mt-2">
                  <div className="text-lg font-bold text-white">OpenRouter</div>
                  <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    100% Free Models ($0.00 / token)
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Scraper Target</span>
                  <ExternalLink className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="mt-2">
                  <div className="text-lg font-bold text-white">Emploi-Public.ma</div>
                  <div className="text-xs text-slate-400 mt-1">Concours & Public Sector IT</div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Alert Channel</span>
                  <Send className="w-4 h-4 text-sky-400" />
                </div>
                <div className="mt-2">
                  <div className="text-lg font-bold text-white">Telegram Bot</div>
                  <div className="text-xs text-amber-400 mt-1">Match & Maybe alerts only</div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Execution Schedule</span>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="mt-2">
                  <div className="text-lg font-bold text-white">Every 3 Hours</div>
                  <div className="text-xs text-slate-400 mt-1">GitHub Actions Cron (`0 */3 * * *`)</div>
                </div>
              </div>
            </div>

            {/* Architecture Details */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-emerald-400" />
                  Agent Execution Pipeline & Spending Safeguards
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  The Morocco IT Job Monitoring agent runs on a strict zero-paid-fallback policy. To guarantee completely free operation and preserve your monthly free-tier allowance:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 space-y-2">
                    <div className="text-sm font-semibold text-indigo-300 flex items-center gap-2">
                      <Filter className="w-4 h-4 text-indigo-400" />
                      1. Loose Keyword Prefilter
                    </div>
                    <p className="text-xs text-slate-400">
                      Discards completely non-IT occupations (nurses, drivers, masonry) before any remote AI API call is initiated, saving up to 80% of tokens.
                    </p>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 space-y-2">
                    <div className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-emerald-400" />
                      2. Verified Model Inference
                    </div>
                    <p className="text-xs text-slate-400">
                      Evaluates announcements with <code>openrouter/free</code> (or specific free models like <code>google/gemma-4-31b-it:free</code>). Parses structured JSON validated strictly with Zod.
                    </p>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 space-y-2">
                    <div className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      3. Quota Exhaustion Circuit Breaker
                    </div>
                    <p className="text-xs text-slate-400">
                      If HTTP 402 or quota exhaustion is encountered, inference halts gracefully immediately. Un-evaluated jobs are preserved as retryable, never fabricated.
                    </p>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 space-y-2">
                    <div className="text-sm font-semibold text-sky-300 flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 text-sky-400" />
                      4. Atomic State & Caching
                    </div>
                    <p className="text-xs text-slate-400">
                      Persistent state in <code>data/seen.json</code> caches AI evaluations permanently so seen jobs are never evaluated twice, eliminating repeat token burn.
                    </p>
                  </div>
                </div>
              </div>

              {/* Model Config & Safety */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Brain className="w-5 h-5 text-indigo-400" />
                  Model Configuration
                </h3>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 font-medium block mb-1">Active OpenRouter Free Model (OPENROUTER_MODEL)</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="openrouter/free">openrouter/free (Default: Smart Free Pool Router - 100% Free)</option>
                      <option value="google/gemma-4-31b-it:free">google/gemma-4-31b-it:free (262k Context - 100% Free)</option>
                      <option value="google/gemma-4-26b-a4b-it:free">google/gemma-4-26b-a4b-it:free (262k Context - 100% Free)</option>
                      <option value="nvidia/nemotron-3.5-lightning:free">nvidia/nemotron-3.5-lightning:free (100% Free)</option>
                      <option value="cohere/north-mini-code:free">cohere/north-mini-code:free (100% Free)</option>
                      <option value="liquid/lfm-2.5-2.6b:free">liquid/lfm-2.5-2.6b:free (100% Free)</option>
                    </select>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                    <div className="font-semibold text-slate-300">Model Verification Status:</div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Pipeline: text-generation</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Inference: Warm (Serverless)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Gated: False (Open access, no license delay)</span>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300">
                    <strong>Zero-Cost Guarantee:</strong> The client does not register any paid provider fallbacks or custom billing tokens.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'simulator' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">Live Job Evaluation Simulator</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Test prefiltering, AI heuristic classification, and notification formatting using verified Moroccan IT announcements.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={runSimulation}
                  disabled={isSimulating}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-xs flex items-center gap-2 transition disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
                  {isSimulating ? 'Running AI Evaluation...' : 'Simulate Batch Evaluation'}
                </button>
              </div>
            </div>

            {/* Filter Buttons */}
            {simulationResults.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Filter Decisions:</span>
                {(['all', 'match', 'maybe', 'reject'] as const).map((dec) => (
                  <button
                    key={dec}
                    onClick={() => setFilterDecision(dec)}
                    className={`px-3 py-1.5 rounded-lg font-medium capitalize transition ${
                      filterDecision === dec
                        ? 'bg-slate-700 text-white border border-slate-600'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {dec} ({simulationResults.filter((j) => (dec === 'all' ? true : j.decision === dec)).length})
                  </button>
                ))}
              </div>
            )}

            {/* Results Grid */}
            {simulationResults.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-3">
                <Bot className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-sm font-semibold text-slate-300">No simulation data generated yet</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Click the "Simulate Batch Evaluation" button above to run the scraper pipeline and AI evaluation rules against representative Moroccan public & private IT job postings.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredJobs.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 hover:border-slate-700 transition"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                              item.decision === 'match'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : item.decision === 'maybe'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {item.decision}
                          </span>

                          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {item.category === 'technicien_specialise'
                              ? 'Category A: Technicien Spécialisé'
                              : item.category === 'it_general'
                              ? 'Category B: General IT'
                              : item.category === 'both'
                              ? 'Category A & B'
                              : 'Irrelevant'}
                          </span>

                          <span className="text-xs text-slate-400 font-mono">
                            Confidence: {item.confidence}%
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-white leading-snug">{item.title}</h4>
                      </div>

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700"
                      >
                        Portal Link
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                      <div>
                        <span className="text-slate-400 font-medium">Employer: </span>
                        <span className="text-slate-200">{item.employer}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Location: </span>
                        <span className="text-slate-200">{item.location}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Qualification Assessment: </span>
                        <span className="text-slate-200">{item.qualification_assessment}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Notification Rule: </span>
                        <span className={item.decision === 'reject' ? 'text-slate-500' : 'text-emerald-400'}>
                          {item.decision === 'reject' ? 'Skipped (Never notify rejects)' : 'Dispatched to Telegram'}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-300 bg-slate-800/40 p-3 rounded-lg border border-slate-800">
                      <strong className="text-slate-400">Evaluation Rationale: </strong>
                      {item.reasons}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'criteria' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white">Matching Criteria Reference (criteria.md)</h2>
              <p className="text-xs text-slate-400 mt-1">
                The AI Judge grounds every decision strictly against these rules. Job descriptions are untrusted inputs and cannot override this constitution.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Category A: Technicien Spécialisé (Bac+2)
                </div>
                <p className="text-xs text-slate-400">
                  Targeted specifically for junior IT technicians and developers with Bac+2 (OFPPT / ISTA / EST / BTS / DUT) in Morocco.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
                  <li>Technicien 3ème grade (Échelle 9) - Spécialité Informatique / Réseaux / Développement</li>
                  <li>Technicien Support & Maintenance Informatique / Helpdesk</li>
                  <li>Développeur Web Junior / Développeur Front-end / Back-end</li>
                  <li>Diplôme de Technicien Spécialisé (DTS Informatique, Réseaux, Systèmes)</li>
                  <li>Diplômes requis: DTS, DUT, BTS, DEUST en informatique</li>
                </ul>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Category B: General IT in Morocco (All Levels)
                </div>
                <p className="text-xs text-slate-400">
                  Any relevant IT role across Morocco, including positions requiring higher qualifications (Bac+3, Bac+5, Ingénieur d'État).
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
                  <li>Ingénieur d'État en Informatique / Échelle 11 (EMI, ENSIAS, INPT, ENSA...)</li>
                  <li>Software Engineer, DevOps, Cloud Architect, Data Engineer</li>
                  <li>Chef de projet IT, Consultant ERP, Cybersécurité</li>
                  <li>Qualifications: Licence Pro (Bac+3), Master, Ingénieur d'État (Bac+5)</li>
                  <li>Does NOT require the words "Technicien Spécialisé"</li>
                </ul>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-2">
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Reject Criteria</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Strictly reject non-IT postings: Medical/Healthcare, Nursing, Civil Engineering (Génie Civil), Mechanical/BTP, Logistics/Drivers, Agriculture, Legal, General Accounting. Reject postings located outside Morocco unless explicitly remote for Moroccan candidates.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'guide' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-semibold text-white">Setup & Deployment Checklist</h2>
              <p className="text-xs text-slate-400">
                Follow these instructions to run the Morocco IT Job Monitoring agent locally or automated on GitHub Actions.
              </p>

              <div className="space-y-4 pt-2">
                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-emerald-400" />
                    1. OpenRouter Free API Key Setup
                  </h4>
                  <p className="text-xs text-slate-400">
                    Sign in to <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-emerald-400 underline font-medium">openrouter.ai/keys</a> and generate a free API key. No credit card is needed. It provides access to 100% free models like <code>openrouter/free</code>, <code>google/gemma-4-31b-it:free</code>, etc. Set as <code>OPENROUTER_API_KEY</code>.
                  </p>
                </div>

                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-emerald-400" />
                    2. Telegram Bot Configuration
                  </h4>
                  <p className="text-xs text-slate-400">
                    Open Telegram and message <code>@BotFather</code>. Send <code>/newbot</code>, choose a name and username, and copy the HTTP API token into <code>TELEGRAM_BOT_TOKEN</code>. Start a chat with your bot, then message <code>@userinfobot</code> to retrieve your numeric ID and set it as <code>TELEGRAM_CHAT_ID</code>.
                  </p>
                </div>

                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-emerald-400" />
                    3. Local Execution Commands
                  </h4>
                  <div className="bg-slate-900 p-3 rounded font-mono text-xs text-slate-300 space-y-1">
                    <div># Run all 34 unit & integration tests:</div>
                    <div className="text-emerald-400">npm test</div>
                    <div className="pt-2"># Run monitoring agent in safe Dry-Run mode:</div>
                    <div className="text-emerald-400">npm run monitor:dry</div>
                    <div className="pt-2"># Run production monitoring agent:</div>
                    <div className="text-emerald-400">npm run monitor</div>
                  </div>
                </div>

                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <ChevronRight className="w-4 h-4 text-emerald-400" />
                    4. GitHub Actions Repository Secrets
                  </h4>
                  <p className="text-xs text-slate-400">
                    In your GitHub repository, go to <strong>Settings → Secrets and variables → Actions</strong> and configure:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-xs">
                    <div className="p-2 bg-slate-900 rounded border border-slate-800 text-slate-300">Secret: OPENROUTER_API_KEY</div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800 text-slate-300">Secret: TELEGRAM_BOT_TOKEN</div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800 text-slate-300">Secret: TELEGRAM_CHAT_ID</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
