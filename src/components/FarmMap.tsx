import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Stage, Layer, Line, Circle, Rect, Text, Group, Transformer } from 'react-konva';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Minus,
  Trash2, 
  MousePointer2, 
  Square, 
  Type, 
  Save, 
  Cpu,
  Move,
  Layers,
  Map as MapIcon,
  Activity,
  Loader2,
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  Battery,
  Clock
} from 'lucide-react';
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
  setDoc
} from '../firebase';

interface MapArea {
  id: string;
  name: string;
  points: number[];
  color: string;
  cropType: string;
  authorId: string;
}

interface MapDevicePlacement {
  id: string;
  deviceId: string;
  x: number;
  y: number;
  authorId: string;
}

interface Device {
  docId: string;
  hardwareId: string;
  name: string;
  type: string;
  subType: string;
  status: string;
  data: Record<string, any>;
  authorId: string;
  workingTime?: string;
  onTime?: string;
  offTime?: string;
  batteryLevel?: number;
}

interface MapConfig {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
  showGrid: boolean;
  authorId: string;
}

const calculateArea = (points: number[]) => {
  if (points.length < 6) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x1 = points[i];
    const y1 = points[i + 1];
    const x2 = points[(i + 2) % points.length];
    const y2 = points[(i + 3) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  // Convert pixels to a meaningful unit (e.g., sq meters)
  // Assuming 1 pixel = 0.5 meters for this demo
  const pixelToMeter = 0.5;
  return Math.abs(area / 2) * (pixelToMeter * pixelToMeter);
};

export default function FarmMap() {
  const [user, setUser] = useState(auth.currentUser);
  const [areas, setAreas] = useState<MapArea[]>([]);
  const [placements, setPlacements] = useState<MapDevicePlacement[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [tool, setTool] = useState<'select' | 'area' | 'device'>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newAreaPoints, setNewAreaPoints] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  
  const stageRef = useRef<any>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    
    // Subscribe to devices
    const qDevices = query(collection(db, 'devices'), where('authorId', '==', user.uid));
    const unsubDevices = onSnapshot(qDevices, (snapshot) => {
      setDevices(snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() })) as Device[]);
    }, (error) => {
      if (error.code === 'permission-denied' && !auth.currentUser) return;
      handleFirestoreError(error, OperationType.LIST, 'devices');
    });

    // Subscribe to map areas
    const qAreas = query(collection(db, 'map_areas'), where('authorId', '==', user.uid));
    const unsubAreas = onSnapshot(qAreas, (snapshot) => {
      setAreas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MapArea[]);
    }, (error) => {
      if (error.code === 'permission-denied' && !auth.currentUser) return;
      handleFirestoreError(error, OperationType.LIST, 'map_areas');
    });

    // Subscribe to map placements
    const qPlacements = query(collection(db, 'map_devices'), where('authorId', '==', user.uid));
    const unsubPlacements = onSnapshot(qPlacements, (snapshot) => {
      setPlacements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MapDevicePlacement[]);
    }, (error) => {
      if (error.code === 'permission-denied' && !auth.currentUser) return;
      handleFirestoreError(error, OperationType.LIST, 'map_devices');
    });

    // Subscribe to map config
    const qConfig = query(collection(db, 'map_configs'), where('authorId', '==', user.uid));
    const unsubConfig = onSnapshot(qConfig, (snapshot) => {
      if (!snapshot.empty) {
        setConfig({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MapConfig);
      } else {
        // Create default config if none exists
        const newConfig = {
          imageUrl: 'none',
          width: 2000,
          height: 2000,
          showGrid: true,
          authorId: user.uid
        };
        addDoc(collection(db, 'map_configs'), newConfig).catch(error => {
          handleFirestoreError(error, OperationType.CREATE, 'map_configs');
        });
      }
      setLoading(false);
    }, (error) => {
      if (error.code === 'permission-denied' && !auth.currentUser) return;
      handleFirestoreError(error, OperationType.LIST, 'map_configs');
    });

    return () => {
      unsubDevices();
      unsubAreas();
      unsubPlacements();
      unsubConfig();
    };
  }, [user]);

  const handleStageMouseDown = (e: any) => {
    if (tool === 'area') {
      const pos = e.target.getStage().getRelativePointerPosition();
      if (!isDrawing) {
        setIsDrawing(true);
        setNewAreaPoints([pos.x, pos.y]);
      } else {
        setNewAreaPoints([...newAreaPoints, pos.x, pos.y]);
      }
    } else if (tool === 'select') {
      const clickedOnEmpty = e.target === e.target.getStage() || e.target.name() === 'background';
      if (clickedOnEmpty) {
        setSelectedId(null);
      }
    }
  };

  const handleStageMouseMove = (e: any) => {
    if (tool === 'area' && isDrawing) {
      // Could show a preview line here
    }
  };

  const handleFinishArea = async () => {
    if (newAreaPoints.length < 6) {
      alert("Please draw at least 3 points for an area.");
      return;
    }
    
    try {
      await addDoc(collection(db, 'map_areas'), {
        name: `Area ${areas.length + 1}`,
        points: newAreaPoints,
        color: '#3b82f6',
        cropType: 'General',
        authorId: user?.uid
      });
      setNewAreaPoints([]);
      setIsDrawing(false);
      setTool('select');
    } catch (error) {
      console.error("Error adding area:", error);
      handleFirestoreError(error, OperationType.CREATE, 'map_areas');
    }
  };

  const handlePlaceDevice = async (deviceId: string) => {
    if (!user) return;
    
    // Place at center of current view
    const stage = stageRef.current;
    const x = (stage.width() / 2 - stagePos.x) / stageScale;
    const y = (stage.height() / 2 - stagePos.y) / stageScale;

    try {
      await addDoc(collection(db, 'map_devices'), {
        deviceId,
        x,
        y,
        authorId: user.uid
      });
      setTool('select');
    } catch (error) {
      console.error("Error placing device:", error);
      handleFirestoreError(error, OperationType.CREATE, 'map_devices');
    }
  };

  const handleDragEnd = async (id: string, type: 'area' | 'device', e: any) => {
    if (type === 'device') {
      const { x, y } = e.target.position();
      try {
        await updateDoc(doc(db, 'map_devices', id), { x, y });
      } catch (error) {
        console.error("Error updating device position:", error);
        handleFirestoreError(error, OperationType.UPDATE, 'map_devices');
      }
    }
    // For areas, we'd need to update all points if we allowed dragging the whole area
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    
    const isArea = areas.find(a => a.id === selectedId);
    const collectionName = isArea ? 'map_areas' : 'map_devices';
    
    try {
      await deleteDoc(doc(db, collectionName, selectedId));
      setSelectedId(null);
    } catch (error) {
      console.error("Error deleting item:", error);
      handleFirestoreError(error, OperationType.DELETE, collectionName);
    }
  };

  const handleUpdateAreaName = async (id: string, e: any) => {
    try {
      await updateDoc(doc(db, 'map_areas', id), { 
        name: e.target.value 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'map_areas');
    }
  };

  const handleUpdateAreaCrop = async (id: string, e: any) => {
    try {
      await updateDoc(doc(db, 'map_areas', id), { 
        cropType: e.target.value 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'map_areas');
    }
  };

  const toggleGrid = async () => {
    if (!config) return;
    try {
      await updateDoc(doc(db, 'map_configs', config.id), {
        showGrid: !config.showGrid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'map_configs');
    }
  };

  const renderGrid = () => {
    if (!config?.showGrid) return null;
    const lines = [];
    const step = 50;
    const width = config.width || 2000;
    const height = config.height || 2000;

    for (let i = 0; i <= width; i += step) {
      lines.push(<Line key={`v-${i}`} points={[i, 0, i, height]} stroke="#e2e8f0" strokeWidth={1} />);
    }
    for (let i = 0; i <= height; i += step) {
      lines.push(<Line key={`h-${i}`} points={[0, i, width, i]} stroke="#e2e8f0" strokeWidth={1} />);
    }
    return lines;
  };
  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const mousePointTo = {
      x: stage.getPointerPosition().x / oldScale - stage.x() / oldScale,
      y: stage.getPointerPosition().y / oldScale - stage.y() / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

    setStageScale(newScale);
    setStagePos({
      x: -(mousePointTo.x - stage.getPointerPosition().x / newScale) * newScale,
      y: -(mousePointTo.y - stage.getPointerPosition().y / newScale) * newScale,
    });
  };

  if (!user) {
    return (
      <div className="clay-card p-12 flex flex-col items-center justify-center text-center">
        <MapIcon className="text-slate-300 mb-4" size={48} />
        <h3 className="text-xl font-bold text-slate-700">Login Required</h3>
        <p className="text-slate-500">Please login to access the interactive farm map.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-200px)] bg-slate-100 rounded-3xl overflow-hidden border-2 border-slate-200 shadow-inner relative">
      {/* Sidebar */}
      <motion.div 
        animate={{ width: sidebarOpen ? 320 : 0 }}
        className="bg-white border-r border-slate-200 flex flex-col overflow-hidden relative z-20"
      >
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Layers size={18} className="text-blue-600" />
              Map Layers
            </h3>
            <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
              <ChevronLeft size={18} />
            </button>
          </div>

          <div className="flex flex-col gap-4 flex-1 overflow-y-auto no-scrollbar">
            {/* Tools Section */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Tools</p>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setTool('select')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                    tool === 'select' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <MousePointer2 size={16} />
                  Select
                </button>
                <button 
                  onClick={() => {
                    setTool('area');
                    setIsDrawing(false);
                    setNewAreaPoints([]);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                    tool === 'area' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Square size={16} />
                  Draw Area
                </button>
              </div>
              {tool === 'area' && isDrawing && (
                <button 
                  onClick={handleFinishArea}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg animate-pulse"
                >
                  <Check size={16} />
                  Finish Area
                </button>
              )}
            </div>

            {/* Map Settings */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Map Settings</p>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={toggleGrid}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    config?.showGrid ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MapIcon size={14} />
                    Show Grid
                  </div>
                  <div className={`w-8 h-4 rounded-full transition-colors relative ${config?.showGrid ? 'bg-blue-600' : 'bg-slate-300'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${config?.showGrid ? 'right-0.5' : 'left-0.5'}`} />
                  </div>
                </button>
              </div>
            </div>

            {/* Devices Section */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Available Devices</p>
              <div className="space-y-2">
                {devices.filter(d => !placements.some(p => p.deviceId === d.docId)).map(device => (
                  <button
                    key={device.docId}
                    onClick={() => handlePlaceDevice(device.docId)}
                    className="w-full flex items-center gap-3 p-3 bg-slate-50 hover:bg-blue-50 rounded-2xl border border-transparent hover:border-blue-200 transition-all text-left group"
                  >
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-blue-600 shadow-sm">
                      <Cpu size={16} />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-xs font-bold text-slate-700 truncate">{device.name}</p>
                      <p className="text-[9px] text-slate-400 uppercase font-bold">{device.subType}</p>
                    </div>
                    <Plus size={14} className="text-slate-300 group-hover:text-blue-600" />
                  </button>
                ))}
                {devices.filter(d => !placements.some(p => p.deviceId === d.docId)).length === 0 && (
                  <p className="text-xs text-slate-400 italic px-1">All devices are placed on the map.</p>
                )}
              </div>
            </div>

            {/* Placed Items */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">On Map</p>
              <div className="space-y-1">
                {areas.map(area => (
                  <div 
                    key={area.id}
                    onClick={() => setSelectedId(area.id)}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedId === area.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: area.color }}></div>
                      <span className="text-xs font-bold truncate">{area.name}</span>
                    </div>
                    {selectedId === area.id && (
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(); }} className="text-rose-500 p-1">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {placements.map(p => {
                  const device = devices.find(d => d.docId === p.deviceId);
                  return (
                    <div 
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                        selectedId === p.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Cpu size={12} className="text-blue-500" />
                        <span className="text-xs font-bold truncate">{device?.name || 'Unknown Device'}</span>
                      </div>
                      {selectedId === p.id && (
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(); }} className="text-rose-500 p-1">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {!sidebarOpen && (
        <button 
          onClick={() => setSidebarOpen(true)}
          className="absolute left-4 top-4 z-30 p-2 bg-white rounded-xl shadow-lg border border-slate-200 text-slate-600 hover:text-blue-600 transition-all"
        >
          <ChevronRight size={20} />
        </button>
      )}

      {/* Map Stage */}
      <div className="flex-1 relative overflow-hidden cursor-crosshair">
        {loading && (
          <div className="absolute inset-0 z-10 bg-slate-100/50 backdrop-blur-sm flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        )}
        
        <Stage
          width={window.innerWidth}
          height={window.innerHeight}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePos.x}
          y={stagePos.y}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onWheel={handleWheel}
          draggable={tool === 'select'}
          ref={stageRef}
        >
          <Layer>
            {/* Background Rect */}
            <Rect 
              width={config?.width || 2000}
              height={config?.height || 2000}
              fill="white"
              name="background"
            />

            {/* Grid */}
            {renderGrid()}

            {/* Areas */}
            {areas.map((area) => (
              <Group key={area.id}>
                {/* Pencil Sketch Effect: Multiple lines with slight offsets */}
                <Line
                  points={area.points}
                  fill={area.color + '22'}
                  stroke={area.color}
                  strokeWidth={selectedId === area.id ? 3 : 1.5}
                  closed
                  lineJoin="round"
                  lineCap="round"
                  tension={0.1}
                  onClick={() => setSelectedId(area.id)}
                  onTap={() => setSelectedId(area.id)}
                />
                <Line
                  points={area.points.map((p, i) => p + (i % 2 === 0 ? 1 : -1))}
                  stroke={area.color}
                  strokeWidth={0.5}
                  opacity={0.4}
                  closed
                  lineJoin="round"
                  lineCap="round"
                  tension={0.2}
                />
                {selectedId === area.id && (
                  <Text 
                    text={`${calculateArea(area.points).toFixed(1)} m²`}
                    x={area.points[0]}
                    y={area.points[1] - 20}
                    fontSize={12}
                    fontStyle="bold"
                    fill={area.color}
                  />
                )}
              </Group>
            ))}

            {/* Drawing Area Preview */}
            {tool === 'area' && isDrawing && (
              <Group>
                <Line
                  points={newAreaPoints}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  lineJoin="round"
                  lineCap="round"
                  dash={[4, 4]}
                />
                <Line
                  points={newAreaPoints.map((p, i) => p + (i % 2 === 0 ? 2 : -2))}
                  stroke="#3b82f6"
                  strokeWidth={1}
                  opacity={0.3}
                  lineJoin="round"
                  lineCap="round"
                />
              </Group>
            )}

            {/* Device Placements */}
            {placements.map((p) => {
              const device = devices.find(d => d.docId === p.deviceId);
              const isSelected = selectedId === p.id;
              
              return (
                <Group
                  key={p.id}
                  x={p.x}
                  y={p.y}
                  draggable={tool === 'select'}
                  onDragEnd={(e) => handleDragEnd(p.id, 'device', e)}
                  onClick={() => setSelectedId(p.id)}
                  onTap={() => setSelectedId(p.id)}
                >
                  {/* Pulse effect for online devices */}
                  {device?.status === 'online' && (
                    <Circle
                      radius={20}
                      fill="#10b981"
                      opacity={0.2}
                      className="animate-pulse"
                    />
                  )}
                  
                  <Rect
                    width={40}
                    height={40}
                    x={-20}
                    y={-20}
                    fill="white"
                    cornerRadius={10}
                    shadowBlur={isSelected ? 10 : 5}
                    shadowColor="black"
                    shadowOpacity={0.2}
                    stroke={isSelected ? '#3b82f6' : 'transparent'}
                    strokeWidth={2}
                  />
                  
                  <Text
                    text={device?.name || 'Device'}
                    x={-50}
                    y={25}
                    width={100}
                    align="center"
                    fontSize={10}
                    fontStyle="bold"
                    fill="#1e293b"
                  />
                  
                  {/* Icon Placeholder (Konva doesn't support Lucide directly easily) */}
                  <Circle
                    radius={12}
                    fill={device?.status === 'online' ? '#10b981' : '#f43f5e'}
                  />
                  <Text
                    text="IoT"
                    x={-8}
                    y={-4}
                    fontSize={8}
                    fill="white"
                    fontStyle="bold"
                  />
                </Group>
              );
            })}
          </Layer>
        </Stage>

        {/* Map Controls */}
        <div className="absolute bottom-6 right-6 flex flex-col gap-2">
          <div className="bg-white p-2 rounded-2xl shadow-xl border border-slate-200 flex flex-col gap-2">
            <button 
              onClick={() => setStageScale(s => s * 1.2)}
              className="p-2 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors"
            >
              <Plus size={20} />
            </button>
            <div className="h-px bg-slate-100 mx-2" />
            <button 
              onClick={() => setStageScale(s => s / 1.2)}
              className="p-2 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors"
            >
              <Minus size={20} />
            </button>
          </div>
          <button 
            onClick={() => {
              setStageScale(1);
              setStagePos({ x: 0, y: 0 });
            }}
            className="bg-white p-3 rounded-2xl shadow-xl border border-slate-200 text-slate-600 hover:text-blue-600 transition-all"
          >
            <Move size={20} />
          </button>
        </div>

        {/* Selected Item Info Overlay */}
        <AnimatePresence>
          {selectedId && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute top-6 right-6 w-64 clay-card p-5 bg-white/95 backdrop-blur-md z-30 border-2 border-blue-100 shadow-2xl"
            >
              {(() => {
                const area = areas.find(a => a.id === selectedId);
                const placement = placements.find(p => p.id === selectedId);
                const device = placement ? devices.find(d => d.docId === placement.deviceId) : null;

                if (area) {
                  return (
                    <>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="font-bold text-slate-800">{area.name}</h4>
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Farming Area</p>
                        </div>
                        <button onClick={handleDelete} className="text-rose-500 p-1 hover:bg-rose-50 rounded-lg">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div className="clay-inner p-3 rounded-xl">
                          <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Field Name</p>
                          <input 
                            type="text"
                            className="w-full bg-transparent text-xs font-bold text-slate-700 outline-none border-b border-blue-200 focus:border-blue-500"
                            value={area.name}
                            onChange={(e) => handleUpdateAreaName(area.id, e)}
                          />
                        </div>
                        <div className="clay-inner p-3 rounded-xl">
                          <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Crop Type</p>
                          <input 
                            type="text"
                            className="w-full bg-transparent text-xs font-bold text-slate-700 outline-none border-b border-blue-200 focus:border-blue-500"
                            value={area.cropType}
                            onChange={(e) => handleUpdateAreaCrop(area.id, e)}
                            placeholder="e.g. Paddy, Coconut"
                          />
                        </div>
                        <div className="clay-inner p-3 rounded-xl">
                          <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Area Size</p>
                          <p className="text-xs font-bold text-slate-700">{calculateArea(area.points).toFixed(2)} m²</p>
                        </div>
                        <div className="clay-inner p-3 rounded-xl">
                          <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Status</p>
                          <p className="text-xs font-bold text-emerald-600">Optimal Growth</p>
                        </div>
                      </div>
                    </>
                  );
                }

                if (device) {
                  return (
                    <>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="font-bold text-slate-800">{device.name}</h4>
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{device.subType}</p>
                        </div>
                        <button onClick={handleDelete} className="text-rose-500 p-1 hover:bg-rose-50 rounded-lg">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div className={`clay-inner p-3 rounded-xl border-l-4 ${device.status === 'online' ? 'border-emerald-500' : 'border-rose-500'}`}>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Live Status</span>
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              device.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}>
                              {device.status}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            {device.batteryLevel !== undefined && (
                              <div className="flex items-center gap-1.5">
                                <Battery size={10} className={device.batteryLevel < 20 ? 'text-rose-500' : 'text-slate-400'} />
                                <span className="text-[10px] font-bold text-slate-700">{device.batteryLevel}%</span>
                              </div>
                            )}
                            {device.workingTime && (
                              <div className="flex items-center gap-1.5">
                                <Clock size={10} className="text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-700">{device.workingTime}h</span>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                            {device.onTime && (
                              <div>
                                <p className="text-[8px] text-slate-400 uppercase font-bold">On Time</p>
                                <p className="text-[10px] font-bold text-slate-700">{device.onTime}</p>
                              </div>
                            )}
                            {device.offTime && (
                              <div>
                                <p className="text-[8px] text-slate-400 uppercase font-bold">Off Time</p>
                                <p className="text-[10px] font-bold text-slate-700">{device.offTime}</p>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 mt-2 border-t border-slate-100 pt-2">
                            {Object.entries(device.data).map(([key, value]) => (
                              <div key={key}>
                                <p className="text-[8px] text-slate-400 uppercase font-bold">{key}</p>
                                <p className="text-xs font-bold text-slate-700">{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold px-1">
                          <Activity size={10} />
                          <span>Last update: Just now</span>
                        </div>
                      </div>
                    </>
                  );
                }

                return null;
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
