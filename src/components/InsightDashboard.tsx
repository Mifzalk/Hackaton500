import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Sprout, 
  CloudSun, 
  Calendar,
  Plus,
  Loader2,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Map as MapIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { 
  db, 
  auth, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  onAuthStateChanged
} from '../firebase';
import { OperationType, handleFirestoreError } from '../lib/firestore-errors';

interface Insight {
  docId: string;
  month: string;
  profit: number;
  growth: number;
  weather: string;
  authorId: string;
  createdAt: string;
}

export default function InsightDashboard() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [totalArea, setTotalArea] = useState(0);
  const [totalDevices, setTotalDevices] = useState(0);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) setLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) {
      if (loading) {
        // Only set loading false if we're sure there's no user
        // We might want to wait a bit for auth to initialize
      }
      setInsights([]);
      // setLoading(false); // Don't set loading false yet, wait for auth to settle
      return;
    }

    // Subscribe to insights
    const qInsights = query(
      collection(db, 'insights'), 
      where('authorId', '==', user.uid),
      orderBy('createdAt', 'asc')
    );

    const unsubInsights = onSnapshot(qInsights, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data()
      })) as Insight[];
      setInsights(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching insights:", error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'insights');
    });

    // Subscribe to map areas for total area calculation
    const qAreas = query(collection(db, 'map_areas'), where('authorId', '==', user.uid));
    const unsubAreas = onSnapshot(qAreas, (snapshot) => {
      let areaSum = 0;
      snapshot.docs.forEach(doc => {
        const points = doc.data().points as number[];
        if (points && points.length >= 6) {
          let area = 0;
          for (let i = 0; i < points.length; i += 2) {
            const x1 = points[i];
            const y1 = points[i + 1];
            const x2 = points[(i + 2) % points.length];
            const y2 = points[(i + 3) % points.length];
            area += x1 * y2 - x2 * y1;
          }
          const pixelToMeter = 0.5;
          areaSum += Math.abs(area / 2) * (pixelToMeter * pixelToMeter);
        }
      });
      setTotalArea(areaSum);
    });

    // Subscribe to devices for total count
    const qDevices = query(collection(db, 'devices'), where('authorId', '==', user.uid));
    const unsubDevices = onSnapshot(qDevices, (snapshot) => {
      setTotalDevices(snapshot.size);
    });

    return () => {
      unsubInsights();
      unsubAreas();
      unsubDevices();
    };
  }, [user]);

  const addSampleData = async () => {
    if (!user) return;
    
    const samples = [
      { month: 'Jan', profit: 1200, growth: 5, weather: 'Sunny' },
      { month: 'Feb', profit: 1500, growth: 8, weather: 'Cloudy' },
      { month: 'Mar', profit: 1100, growth: -2, weather: 'Rainy' },
      { month: 'Apr', profit: 1800, growth: 12, weather: 'Sunny' },
      { month: 'May', profit: 2200, growth: 15, weather: 'Sunny' },
      { month: 'Jun', profit: 2100, growth: 14, weather: 'Partly Cloudy' },
    ];

    try {
      for (const sample of samples) {
        await addDoc(collection(db, 'insights'), {
          ...sample,
          authorId: user.uid,
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'insights');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p>Analyzing farm data...</p>
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="clay-card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
          <BarChart3 className="text-blue-500" size={32} />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">No Insight Data Yet</h3>
        <p className="text-slate-500 max-w-md mx-auto mb-8">
          Start tracking your farm's performance by adding monthly insights. 
          View trends in profit, growth, and weather conditions.
        </p>
        <button 
          onClick={addSampleData}
          className="clay-button bg-blue-600 text-white flex items-center gap-2"
        >
          <Plus size={20} />
          <span>Generate Sample Insights</span>
        </button>
      </div>
    );
  }

  const totalProfit = insights.reduce((sum, i) => sum + i.profit, 0);
  const avgGrowth = insights.reduce((sum, i) => sum + i.growth, 0) / insights.length;
  const latestInsight = insights[insights.length - 1];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryCard 
          title="Total Profit" 
          value={`$${totalProfit.toLocaleString()}`} 
          icon={DollarSign} 
          color="blue"
          trend={latestInsight.profit > (insights[insights.length - 2]?.profit || 0) ? 'up' : 'down'}
        />
        <SummaryCard 
          title="Avg Growth" 
          value={`${avgGrowth.toFixed(1)}%`} 
          icon={Sprout} 
          color="emerald"
          trend={avgGrowth > 0 ? 'up' : 'down'}
        />
        <SummaryCard 
          title="Total Area" 
          value={`${totalArea.toFixed(1)} m²`} 
          icon={MapIcon} 
          color="indigo"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryCard 
          title="Total Devices" 
          value={`${totalDevices}`} 
          icon={Activity} 
          color="blue"
        />
        <SummaryCard 
          title="Current Weather" 
          value={latestInsight.weather} 
          icon={CloudSun} 
          color="amber"
        />
        <SummaryCard 
          title="Active Month" 
          value={latestInsight.month} 
          icon={Calendar} 
          color="indigo"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profit Trend */}
        <div className="clay-card p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-500" />
              Profit Performance
            </h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={insights}>
                <defs>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Growth Comparison */}
        <div className="clay-card p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Activity size={18} className="text-emerald-500" />
              Growth Rate (%)
            </h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insights}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="growth" radius={[4, 4, 0, 0]}>
                  {insights.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.growth >= 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="clay-card overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Monthly Insight Log</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-6 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Month</th>
                <th className="px-6 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Profit</th>
                <th className="px-6 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Growth</th>
                <th className="px-6 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Weather</th>
                <th className="px-6 py-3 text-[10px] uppercase tracking-wider font-bold text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {insights.map((insight) => (
                <tr key={insight.docId} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-700">{insight.month}</td>
                  <td className="px-6 py-4 font-medium text-slate-600">${insight.profit.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className={`flex items-center gap-1 font-bold ${insight.growth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {insight.growth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {Math.abs(insight.growth)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{insight.weather}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                      insight.growth >= 10 ? 'bg-emerald-100 text-emerald-700' : 
                      insight.growth >= 0 ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {insight.growth >= 10 ? 'Excellent' : insight.growth >= 0 ? 'Stable' : 'Declining'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, color, trend }: { 
  title: string, 
  value: string, 
  icon: any, 
  color: 'blue' | 'emerald' | 'amber' | 'indigo',
  trend?: 'up' | 'down'
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    indigo: 'bg-indigo-50 text-indigo-600'
  };

  return (
    <div className="clay-card p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colors[color]}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{title}</p>
        <div className="flex items-center gap-2">
          <h4 className="text-xl font-black text-slate-800">{value}</h4>
          {trend && (
            <span className={trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}>
              {trend === 'up' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
