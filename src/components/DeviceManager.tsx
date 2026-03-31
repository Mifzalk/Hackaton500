import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Thermometer, 
  Droplets, 
  Wind, 
  Zap, 
  Radio, 
  Plane, 
  Activity, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  Cloud, 
  Database,
  Search,
  Filter,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { OperationType, handleFirestoreError } from '../lib/firestore-errors';
import { 
  db, 
  auth, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where,
  onAuthStateChanged
} from '../firebase';

interface Device {
  docId: string; // Firestore doc ID
  hardwareId: string; // User input ID
  name: string;
  type: 'sensor' | 'automated_system' | 'aerial_tech' | 'connectivity_hub' | 'integration_point';
  subType: string;
  status: 'online' | 'offline' | 'connecting';
  workingTime?: number;
  onTime?: string;
  offTime?: string;
  batteryLevel?: number;
  data: Record<string, any>;
  authorId: string;
  createdAt: string;
}

const CATEGORIES = [
  { id: 'all', label: 'All Devices', icon: Cpu },
  { id: 'sensor', label: 'Smart Sensors', icon: Thermometer },
  { id: 'automated_system', label: 'Automated Systems', icon: Zap },
  { id: 'aerial_tech', label: 'Aerial Tech', icon: Plane },
  { id: 'connectivity_hub', label: 'Connectivity', icon: Radio },
  { id: 'integration_point', label: 'Integrations', icon: Cloud },
];

const SUBTYPES: Record<string, string[]> = {
  sensor: ['Soil Moisture', 'NPK Sensor', 'Temperature/Humidity', 'pH Sensor', 'Cattle Wearable'],
  automated_system: ['Drip Irrigation', 'Smart Fertigation', 'Greenhouse Control'],
  aerial_tech: ['Multispectral Drone', 'Crop Spraying UAV', 'Mapping Drone'],
  connectivity_hub: ['LoRaWAN Gateway', 'NB-IoT Node', 'ZigBee Hub', '5G/4G Router'],
  integration_point: ['Data Analytics', 'IBM Watson IoT', 'Microsoft Azure', 'Farm Management Software'],
};

export default function DeviceManager() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [filter, setFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState(auth.currentUser);
  
  const [newDevice, setNewDevice] = useState({
    hardwareId: '',
    name: '',
    type: 'sensor' as Device['type'],
    subType: 'Soil Moisture',
    status: 'online' as Device['status'],
    workingTime: 0,
    onTime: '08:00',
    offTime: '18:00',
    batteryLevel: 100,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setDevices([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'devices'), where('authorId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ 
        docId: doc.id, 
        ...doc.data() 
      })) as Device[];
      setDevices(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching devices:", error);
      setLoading(false);
      if (error.code === 'permission-denied' && !auth.currentUser) return;
      handleFirestoreError(error, OperationType.LIST, 'devices');
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    if (!newDevice.hardwareId || !newDevice.name) {
      alert("Please fill in all required fields.");
      return;
    }

    try {
      const deviceData = {
        id: newDevice.hardwareId,
        hardwareId: newDevice.hardwareId,
        name: newDevice.name,
        type: newDevice.type,
        subType: newDevice.subType,
        status: newDevice.status,
        workingTime: newDevice.workingTime,
        onTime: newDevice.onTime,
        offTime: newDevice.offTime,
        batteryLevel: newDevice.batteryLevel,
      };

      if (editingDevice) {
        await updateDoc(doc(db, 'devices', editingDevice.docId), deviceData);
      } else {
        await addDoc(collection(db, 'devices'), {
          ...deviceData,
          data: getRandomData(newDevice.subType),
          authorId: user.uid,
          createdAt: new Date().toISOString(),
        });
      }
      
      setShowAddModal(false);
      setEditingDevice(null);
      setNewDevice({
        hardwareId: '',
        name: '',
        type: 'sensor',
        subType: 'Soil Moisture',
        status: 'online',
        workingTime: 0,
        onTime: '08:00',
        offTime: '18:00',
        batteryLevel: 100,
      });
    } catch (error) {
      console.error("Error saving device:", error);
      handleFirestoreError(error, editingDevice ? OperationType.UPDATE : OperationType.CREATE, 'devices');
    }
  };

  const handleEditDevice = (device: Device) => {
    setEditingDevice(device);
    setNewDevice({
      hardwareId: device.hardwareId,
      name: device.name,
      type: device.type,
      subType: device.subType,
      status: device.status,
      workingTime: device.workingTime || 0,
      onTime: device.onTime || '08:00',
      offTime: device.offTime || '18:00',
      batteryLevel: device.batteryLevel || 100,
    });
    setShowAddModal(true);
  };

  const handleToggleStatus = async (device: Device) => {
    const nextStatus: Device['status'] = device.status === 'online' ? 'offline' : 'online';
    try {
      await updateDoc(doc(db, 'devices', device.docId), {
        status: nextStatus,
        // Include required fields for the rules validator
        id: device.hardwareId,
        name: device.name,
        type: device.type,
        authorId: device.authorId,
        createdAt: device.createdAt
      });
    } catch (error) {
      console.error("Error toggling status:", error);
      handleFirestoreError(error, OperationType.UPDATE, 'devices');
    }
  };

  const handleDeleteDevice = async (docId: string) => {
    try {
      await deleteDoc(doc(db, 'devices', docId));
    } catch (error) {
      console.error("Error deleting device:", error);
      handleFirestoreError(error, OperationType.DELETE, 'devices');
    }
  };

  const getRandomData = (subType: string) => {
    switch (subType) {
      case 'Soil Moisture': return { moisture: '32%', battery: '85%' };
      case 'NPK Sensor': return { nitrogen: '20mg/kg', phosphorus: '15mg/kg', potassium: '25mg/kg' };
      case 'Temperature/Humidity': return { temp: '28°C', humidity: '65%' };
      case 'Drip Irrigation': return { flowRate: '2.5L/h', status: 'Active' };
      case 'Multispectral Drone': return { altitude: '50m', battery: '92%', coverage: '12%' };
      case 'LoRaWAN Gateway': return { nodes: 12, signal: '-85dBm' };
      default: return { status: 'Monitoring' };
    }
  };

  const filteredDevices = devices.filter(d => {
    const matchesFilter = filter === 'all' || d.type === filter;
    const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         d.hardwareId.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getStatusIcon = (status: Device['status']) => {
    switch (status) {
      case 'online': return <CheckCircle2 className="text-emerald-500" size={16} />;
      case 'offline': return <AlertCircle className="text-rose-500" size={16} />;
      case 'connecting': return <Loader2 className="text-amber-500 animate-spin" size={16} />;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">IoT Device Management</h2>
          <p className="text-slate-500">Monitor and configure your smart farming infrastructure</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              setEditingDevice(null);
              setNewDevice({
                hardwareId: '',
                name: '',
                type: 'sensor',
                subType: 'Soil Moisture',
                status: 'online',
                workingTime: 0,
                onTime: '08:00',
                offTime: '18:00',
                batteryLevel: 100,
              });
              setShowAddModal(true);
            }}
            className="clay-button bg-blue-600 text-white flex items-center gap-2"
          >
            <Plus size={20} />
            <span>Add Device</span>
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap border ${
                filter === cat.id 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                  : 'bg-white text-slate-600 border-slate-100 hover:border-blue-200'
              }`}
            >
              <cat.icon size={18} />
              <span className="font-medium">{cat.label}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search hardware ID or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* Device List */}
      {!user ? (
        <div className="clay-card p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Cpu className="text-slate-300" size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-700">Login Required</h3>
          <p className="text-slate-500 max-w-xs mx-auto mb-6">
            Please login to manage your IoT devices and view real-time data.
          </p>
        </div>
      ) : loading ? (
        <div className="clay-card p-12 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="animate-spin mb-4" size={48} />
          <p>Loading your IoT network...</p>
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="clay-card p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Cpu className="text-slate-300" size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-700">No devices found</h3>
          <p className="text-slate-500 max-w-xs mx-auto mb-6">
            {searchQuery || filter !== 'all' 
              ? "No devices match your current filters." 
              : "Start building your smart farm by adding your first IoT sensor or system."}
          </p>
          <button 
            onClick={() => setShowAddModal(true)}
            className="text-blue-600 font-bold hover:underline"
          >
            Add your first device
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredDevices.map((device) => (
              <motion.div
                key={device.docId}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="clay-card p-5 group hover:border-blue-200 transition-colors"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      device.status === 'online' ? 'bg-emerald-50 text-emerald-600' : 
                      device.status === 'offline' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {(() => {
                        const Icon = CATEGORIES.find(c => c.id === device.type)?.icon || Cpu;
                        return <Icon size={20} />;
                      })()}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 leading-none mb-1">{device.name}</h4>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{device.subType}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleStatus(device)}
                      className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md transition-all ${
                        device.status === 'online' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 
                        device.status === 'offline' ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : 'bg-amber-100 text-amber-700'
                      }`}
                      title="Click to toggle status"
                    >
                      {device.status}
                    </button>
                    <button 
                      onClick={() => handleEditDevice(device)}
                      className="p-1.5 text-slate-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteDevice(device.docId)}
                      className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="clay-inset p-3 mb-4 grid grid-cols-2 gap-2 relative group/data">
                  {Object.entries(device.data).map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">{key}</span>
                      <span className="text-sm font-bold text-slate-700">{value}</span>
                    </div>
                  ))}
                  {device.workingTime !== undefined && (
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Working Time</span>
                      <span className="text-sm font-bold text-slate-700">{device.workingTime}h</span>
                    </div>
                  )}
                  {device.batteryLevel !== undefined && (
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Battery</span>
                      <span className="text-sm font-bold text-slate-700">{device.batteryLevel}%</span>
                    </div>
                  )}
                  {device.onTime && device.offTime && (
                    <div className="col-span-2 flex flex-col">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Schedule</span>
                      <span className="text-sm font-bold text-slate-700">{device.onTime} - {device.offTime}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                  <div className="flex items-center gap-1">
                    <Activity size={10} />
                    <span>ID: {device.hardwareId}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <RefreshCw size={10} />
                    <span>Updated 2m ago</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add Device Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="clay-card w-full max-w-md p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">
                  {editingDevice ? 'Edit Device' : 'Register New Device'}
                </h3>
                <button 
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingDevice(null);
                  }} 
                  className="p-2 hover:bg-slate-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleAddDevice} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Hardware ID (MAC/Serial)</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. SN-9847-X2"
                    value={newDevice.hardwareId}
                    onChange={(e) => setNewDevice({...newDevice, hardwareId: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Device Name</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. North Field Soil Sensor"
                    value={newDevice.name}
                    onChange={(e) => setNewDevice({...newDevice, name: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Category</label>
                    <select 
                      value={newDevice.type}
                      onChange={(e) => {
                        const type = e.target.value as Device['type'];
                        setNewDevice({...newDevice, type, subType: SUBTYPES[type][0]});
                      }}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none"
                    >
                      {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Device Model</label>
                    <select 
                      value={newDevice.subType}
                      onChange={(e) => setNewDevice({...newDevice, subType: e.target.value})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none"
                    >
                      {SUBTYPES[newDevice.type].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Status</label>
                    <select 
                      value={newDevice.status}
                      onChange={(e) => setNewDevice({...newDevice, status: e.target.value as Device['status']})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none"
                    >
                      <option value="online">Online</option>
                      <option value="offline">Offline</option>
                      <option value="connecting">Connecting</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Battery (%)</label>
                    <input 
                      type="number" 
                      min="0"
                      max="100"
                      value={newDevice.batteryLevel}
                      onChange={(e) => setNewDevice({...newDevice, batteryLevel: parseInt(e.target.value)})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">On Time</label>
                    <input 
                      type="time" 
                      value={newDevice.onTime}
                      onChange={(e) => setNewDevice({...newDevice, onTime: e.target.value})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Off Time</label>
                    <input 
                      type="time" 
                      value={newDevice.offTime}
                      onChange={(e) => setNewDevice({...newDevice, offTime: e.target.value})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Working Time (Hours)</label>
                  <input 
                    type="number" 
                    min="0"
                    value={newDevice.workingTime}
                    onChange={(e) => setNewDevice({...newDevice, workingTime: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>

                <div className="pt-4">
                  <button 
                    type="submit"
                    className="w-full clay-button bg-blue-600 text-white font-bold"
                  >
                    {editingDevice ? 'Update Device' : 'Register Device'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
