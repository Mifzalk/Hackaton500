import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { Camera, MapPin, Calendar, TrendingUp, Leaf, CloudRain, Info, Menu, X, ChevronRight, ChevronLeft, LogIn, LogOut, User as UserIcon, Plus, Trash2, Edit2, Map, Cpu, BarChart3, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { diagnoseCropDisease, getCropCalendar, analyzeSoilHealth } from './services/geminiService';
import DeviceManager from './components/DeviceManager';
import FarmMap from './components/FarmMap';
import InsightDashboard from './components/InsightDashboard';
import AIAssistant from './components/AIAssistant';
import { OperationType, handleFirestoreError } from './lib/firestore-errors';
import { 
  db, 
  auth, 
  signInWithGoogle, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  onSnapshot, 
  onAuthStateChanged, 
  query,
  where,
  User 
} from './firebase';

// Error Boundary Component
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorDetails = null;
      if (this.state.error?.message?.startsWith('{')) {
        try {
          errorDetails = JSON.parse(this.state.error.message);
        } catch (e) {
          // Ignore parse error
        }
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="clay-card p-8 max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h2>
            <p className="text-slate-600 mb-6">
              {errorDetails 
                ? `A database error occurred during ${errorDetails.operationType} on ${errorDetails.path}.` 
                : "An unexpected error occurred."}
            </p>
            {errorDetails && (
              <div className="text-left bg-slate-100 p-4 rounded-xl mb-6 overflow-auto max-h-48">
                <pre className="text-xs text-slate-700">{JSON.stringify(errorDetails, null, 2)}</pre>
              </div>
            )}
            <button 
              onClick={() => window.location.reload()} 
              className="clay-button bg-blue-600 text-white px-6 py-2"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'planting' | 'harvesting' | 'fertilizing' | 'irrigation' | 'other';
  description?: string;
  authorId: string;
}

interface DiagnosisRecord {
  id: string;
  image: string;
  result: string;
  createdAt: string;
  authorId: string;
}

interface FarmField {
  id: string;
  name: string;
  crop: string;
  area: number;
  location: { lat: number; lng: number };
  iotData?: {
    soilMoisture: number;
    temperature: number;
    humidity: number;
    lastUpdated: string;
  };
  soilHealth?: {
    ph: number;
    nitrogen: number;
    phosphorus: number;
    potassium: number;
    recommendations?: string;
    lastTested: string;
  };
  authorId: string;
}

function AppContent() {
  const [activeTab, setActiveTab] = useState('diagnostics');
  const [diagnosisResult, setDiagnosisResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [markets, setMarkets] = useState<any[]>([]);
  const [filteredMarkets, setFilteredMarkets] = useState<any[]>([]);
  const [marketFilter, setMarketFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedResource, setSelectedResource] = useState<any | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [newResource, setNewResource] = useState({ 
    name: '', 
    type: 'market', 
    contact: '', 
    contactPerson: '',
    operatingHours: '',
    services: '',
    prices: '',
    variety: ''
  });
  const [newReview, setNewReview] = useState({ user: '', rating: 5, comment: '' });
  const [cropCalendar, setCropCalendar] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [newEvent, setNewEvent] = useState<{
    title: string;
    date: string;
    description: string;
    type: 'planting' | 'harvesting' | 'fertilizing' | 'irrigation' | 'other';
  }>({
    title: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    type: 'planting'
  });
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [diagnosticsHistory, setDiagnosticsHistory] = useState<DiagnosisRecord[]>([]);
  const [fields, setFields] = useState<FarmField[]>([]);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [showSoilModal, setShowSoilModal] = useState(false);
  const [soilAnalysisLoading, setSoilAnalysisLoading] = useState(false);
  const [soilHealthInput, setSoilHealthInput] = useState({
    ph: 6.5,
    nitrogen: 20,
    phosphorus: 15,
    potassium: 25
  });
  const [selectedField, setSelectedField] = useState<FarmField | null>(null);
  const [newField, setNewField] = useState({
    name: '',
    crop: '',
    area: 0,
    location: { lat: 10.0, lng: 76.0 },
    iotData: {
      soilMoisture: 45,
      temperature: 28,
      humidity: 65,
      lastUpdated: new Date().toISOString()
    }
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    const path = 'markets';
    console.log(`Subscribing to ${path}...`);
    const unsubscribe = onSnapshot(collection(db, path), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`Received ${data.length} markets from ${path}.`);
      setMarkets(data);
      setFilteredMarkets(data);
    }, (error) => {
      console.error(`Error in onSnapshot for ${path}:`, error);
      // Only throw if it's not a permission error while logging out
      if (error.code === 'permission-denied' && !auth.currentUser) {
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  useEffect(() => {
    if (!isAuthReady || !user) {
      setCalendarEvents([]);
      return;
    }

    const path = 'calendar';
    const q = query(collection(db, path), where('authorId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as CalendarEvent[];
      setCalendarEvents(data);
    }, (error) => {
      if (error.code === 'permission-denied' && !auth.currentUser) return;
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  useEffect(() => {
    if (!isAuthReady || !user) {
      setDiagnosticsHistory([]);
      return;
    }

    const path = 'diagnostics';
    const q = query(collection(db, path), where('authorId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DiagnosisRecord[];
      // Sort by date descending
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDiagnosticsHistory(data);
    }, (error) => {
      if (error.code === 'permission-denied' && !auth.currentUser) return;
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  useEffect(() => {
    if (!isAuthReady || !user) {
      setFields([]);
      return;
    }

    const path = 'fields';
    const q = query(collection(db, path), where('authorId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as FarmField[];
      setFields(data);
    }, (error) => {
      if (error.code === 'permission-denied' && !auth.currentUser) return;
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  useEffect(() => {
    handleGetCalendar();
  }, []);

  useEffect(() => {
    let result = markets;
    if (marketFilter !== 'all') {
      result = result.filter(m => m.type === marketFilter);
    }
    if (searchQuery) {
      result = result.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    setFilteredMarkets(result);
  }, [marketFilter, searchQuery, markets]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const path = 'calendar';
    try {
      if (selectedEvent) {
        await updateDoc(doc(db, path, selectedEvent.id), {
          ...newEvent,
          authorId: user.uid
        });
      } else {
        await addDoc(collection(db, path), {
          ...newEvent,
          authorId: user.uid
        });
      }
      setShowEventModal(false);
      setSelectedEvent(null);
      setNewEvent({
        title: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        type: 'planting'
      });
    } catch (error) {
      handleFirestoreError(error, selectedEvent ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    const path = 'calendar';
    try {
      await deleteDoc(doc(db, path, id));
      setShowEventModal(false);
      setSelectedEvent(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setNewEvent({
      title: event.title,
      date: event.date,
      description: event.description || '',
      type: event.type
    });
    setShowEventModal(true);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Please login to add a resource.");
      return;
    }

    const path = 'markets';
    try {
      const resourceData = {
        ...newResource,
        location: selectedResource?.location || { lat: 10 + Math.random(), lng: 76 + Math.random() },
        prices: newResource.type === 'market' ? 
          newResource.prices.split(',').reduce((acc: any, curr) => {
            const [item, price] = curr.split(':').map(s => s.trim());
            if (item && price) acc[item] = price;
            return acc;
          }, {}) : {},
        services: newResource.type === 'bhavan' ? newResource.services.split(',').map(s => s.trim()).filter(s => s) : [],
        variety: newResource.type === 'seedbank' ? newResource.variety.split(',').map(v => v.trim()).filter(v => v) : [],
        status: 'Open',
        reviews: selectedResource?.reviews || [],
        authorId: user.uid,
        createdAt: selectedResource?.createdAt || new Date().toISOString()
      };

      if (selectedResource && showAddModal) {
        await updateDoc(doc(db, path, selectedResource.id), resourceData);
      } else {
        await addDoc(collection(db, path), resourceData);
      }
      setShowAddModal(false);
      setSelectedResource(null);
      setNewResource({ 
        name: '', 
        type: 'market', 
        contact: '', 
        contactPerson: '',
        operatingHours: '',
        services: '',
        prices: '',
        variety: ''
      });
    } catch (error) {
      handleFirestoreError(error, selectedResource ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const handleDeleteResource = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this resource?")) return;
    const path = 'markets';
    try {
      await deleteDoc(doc(db, path, id));
      setSelectedResource(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleEditResource = (resource: any) => {
    setSelectedResource(resource);
    setNewResource({
      name: resource.name,
      type: resource.type,
      contact: resource.contact,
      contactPerson: resource.contactPerson || '',
      operatingHours: resource.operatingHours || '',
      services: resource.services ? resource.services.join(', ') : '',
      prices: resource.prices ? Object.entries(resource.prices).map(([k, v]) => `${k}: ${v}`).join(', ') : '',
      variety: resource.variety ? resource.variety.join(', ') : ''
    });
    setShowAddModal(true);
  };

  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResource || !user) {
      alert("Please login to add a review.");
      return;
    }

    const path = `markets/${selectedResource.id}`;
    try {
      const review = {
        user: user.displayName || user.email || "Anonymous Farmer",
        rating: newReview.rating,
        comment: newReview.comment,
        createdAt: new Date().toISOString()
      };
      
      const updatedReviews = [...(selectedResource.reviews || []), review];
      await updateDoc(doc(db, 'markets', selectedResource.id), {
        reviews: updatedReviews
      });
      
      setNewReview({ user: '', rating: 5, comment: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const path = 'fields';
    try {
      if (selectedField) {
        await updateDoc(doc(db, path, selectedField.id), {
          ...newField,
          iotData: selectedField.iotData || {
            soilMoisture: Math.floor(Math.random() * 40) + 30,
            temperature: Math.floor(Math.random() * 10) + 25,
            humidity: Math.floor(Math.random() * 30) + 50,
            lastUpdated: new Date().toISOString()
          }
        });
      } else {
        await addDoc(collection(db, path), {
          ...newField,
          iotData: {
            soilMoisture: Math.floor(Math.random() * 40) + 30,
            temperature: Math.floor(Math.random() * 10) + 25,
            humidity: Math.floor(Math.random() * 30) + 50,
            lastUpdated: new Date().toISOString()
          },
          authorId: user.uid,
          createdAt: new Date().toISOString()
        });
      }
      setShowFieldModal(false);
      setSelectedField(null);
      setNewField({ 
        name: '', 
        crop: '', 
        area: 0, 
        location: { lat: 10.0, lng: 76.0 },
        iotData: {
          soilMoisture: 45,
          temperature: 28,
          humidity: 65,
          lastUpdated: new Date().toISOString()
        }
      });
    } catch (error) {
      handleFirestoreError(error, selectedField ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const handleDeleteField = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this field?")) return;
    const path = 'fields';
    try {
      await deleteDoc(doc(db, path, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleSoilAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedField || !user) return;

    setSoilAnalysisLoading(true);
    try {
      const recommendations = await analyzeSoilHealth({
        ...soilHealthInput,
        crop: selectedField.crop
      });

      const updatedSoilHealth = {
        ...soilHealthInput,
        recommendations,
        lastTested: new Date().toISOString()
      };

      await updateDoc(doc(db, 'fields', selectedField.id), {
        soilHealth: updatedSoilHealth
      });

      setShowSoilModal(false);
    } catch (error) {
      console.error("Soil analysis failed", error);
      alert("Soil analysis failed. Please try again.");
    } finally {
      setSoilAnalysisLoading(false);
    }
  };

  const handleEditField = (field: FarmField) => {
    setSelectedField(field);
    setNewField({
      name: field.name,
      crop: field.crop,
      area: field.area,
      location: field.location,
      iotData: field.iotData || {
        soilMoisture: 45,
        temperature: 28,
        humidity: 65,
        lastUpdated: new Date().toISOString()
      }
    });
    setShowFieldModal(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        setImage(reader.result as string);
        handleDiagnose(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDiagnose = async (base64: string) => {
    setLoading(true);
    try {
      const result = await diagnoseCropDisease(base64);
      setDiagnosisResult(result);
      
      if (user) {
        const path = 'diagnostics';
        await addDoc(collection(db, path), {
          image: `data:image/jpeg;base64,${base64}`,
          result,
          createdAt: new Date().toISOString(),
          authorId: user.uid
        });
      }
    } catch (error) {
      console.error(error);
      setDiagnosisResult("Error diagnosing crop. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDiagnosis = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this diagnosis record?")) return;
    const path = 'diagnostics';
    try {
      await deleteDoc(doc(db, path, id));
      if (diagnosisResult) {
        // If the deleted one was the current one, clear it
        const deleted = diagnosticsHistory.find(d => d.id === id);
        if (deleted && deleted.result === diagnosisResult) {
          setDiagnosisResult(null);
          setImage(null);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleGetCalendar = async () => {
    setLoading(true);
    try {
      const result = await getCropCalendar("Current monsoon patterns in Kerala with moderate rainfall expected in Ernakulam and Thrissur.");
      setCropCalendar(result);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const seedSampleData = async () => {
    if (!user) {
      alert("Please login to seed data.");
      return;
    }
    console.log("Starting seedSampleData...");
    setLoading(true);
    
    const marketsData = [
      { 
        type: 'market', 
        name: "Ernakulam Market", 
        location: { lat: 9.9816, lng: 76.2999 }, 
        prices: { coconut: "₹35/kg", rubber: "₹160/kg", banana: "₹45/kg" }, 
        status: 'Open', 
        operatingHours: "6:00 AM - 8:00 PM",
        contactPerson: "Mr. Raghavan",
        contact: "9847012345",
        reviews: [{ user: "Ravi K.", rating: 5, comment: "Best prices for rubber!" }] 
      },
      { 
        type: 'market', 
        name: "Thrissur Market", 
        location: { lat: 10.5276, lng: 76.2144 }, 
        prices: { coconut: "₹32/kg", rubber: "₹158/kg", banana: "₹42/kg" }, 
        status: 'Open', 
        operatingHours: "5:00 AM - 7:00 PM",
        contactPerson: "Mr. Thomas",
        contact: "9447054321",
        reviews: [] 
      },
      { 
        type: 'bhavan', 
        name: "Krishi Bhavan, Aluva", 
        location: { lat: 10.1076, lng: 76.3511 }, 
        contact: "0484-2624232", 
        contactPerson: "Mrs. Lakshmi (AO)",
        operatingHours: "10:00 AM - 5:00 PM",
        services: ["Seed Distribution", "Soil Testing"], 
        reviews: [{ user: "Soman P.", rating: 4, comment: "Very helpful staff." }] 
      },
      { 
        type: 'seedbank', 
        name: "Kerala State Seed Bank, Thrissur", 
        location: { lat: 10.5500, lng: 76.2500 }, 
        contact: "0487-2334455", 
        contactPerson: "Dr. Menon",
        operatingHours: "9:00 AM - 5:00 PM",
        variety: ["High Yield Paddy", "Hybrid Coconut"], 
        reviews: [] 
      }
    ];

    const fieldsData = [
      {
        name: "North Field",
        crop: "Paddy",
        area: 1200,
        location: { lat: 10.1076, lng: 76.3511 },
        iotData: {
          soilMoisture: 42,
          temperature: 28,
          humidity: 65,
          lastUpdated: new Date().toISOString()
        }
      },
      {
        name: "South Orchard",
        crop: "Coconut",
        area: 2500,
        location: { lat: 10.1080, lng: 76.3520 },
        iotData: {
          soilMoisture: 38,
          temperature: 30,
          humidity: 60,
          lastUpdated: new Date().toISOString()
        }
      }
    ];

    const eventsData = [
      {
        title: "Paddy Planting",
        date: new Date().toISOString().split('T')[0],
        type: 'planting',
        description: "Planting high yield paddy seeds in North Field."
      },
      {
        title: "Coconut Fertilizing",
        date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
        type: 'fertilizing',
        description: "Applying organic fertilizer to coconut trees."
      }
    ];

    const devicesData = [
      {
        hardwareId: "NODE-001",
        name: "Soil Sensor 1",
        type: "sensor",
        subType: "soil-moisture",
        status: "online",
        batteryLevel: 85,
        data: { moisture: 42, temp: 28 }
      },
      {
        hardwareId: "VALVE-001",
        name: "Irrigation Valve 1",
        type: "actuator",
        subType: "water-valve",
        status: "offline",
        batteryLevel: 92,
        data: { state: "closed" }
      }
    ];

    try {
      // Seed Markets
      for (const item of marketsData) {
        await addDoc(collection(db, 'markets'), {
          ...item,
          authorId: user.uid,
          createdAt: new Date().toISOString()
        });
      }

      // Seed Fields
      for (const item of fieldsData) {
        await addDoc(collection(db, 'fields'), {
          ...item,
          authorId: user.uid,
          createdAt: new Date().toISOString()
        });
      }

      // Seed Events
      for (const item of eventsData) {
        await addDoc(collection(db, 'calendar'), {
          ...item,
          authorId: user.uid,
          createdAt: new Date().toISOString()
        });
      }

      // Seed Devices
      for (const item of devicesData) {
        await addDoc(collection(db, 'devices'), {
          ...item,
          authorId: user.uid,
          createdAt: new Date().toISOString()
        });
      }

      console.log("Seeding complete!");
      alert("Sample data seeded successfully!");
    } catch (error) {
      console.error("Error in seedSampleData:", error);
      handleFirestoreError(error, OperationType.CREATE, 'multiple');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Leaf className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">AgriPulse Kerala</h1>
            <p className="text-sm text-slate-500 font-medium">Empowering Farmers with AI</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden md:block text-right">
                <p className="text-xs font-bold text-slate-800">{user.displayName || user.email}</p>
                <p className="text-[10px] text-slate-500">Farmer</p>
              </div>
              <button 
                onClick={() => auth.signOut()}
                className="p-2 clay-inner rounded-full text-red-500 hover:bg-red-50 transition-colors"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <button 
              onClick={signInWithGoogle}
              className="clay-button bg-blue-600 text-white px-4 py-2 flex items-center gap-2 text-sm"
            >
              <LogIn size={16} />
              <span>Login</span>
            </button>
          )}
          <button className="p-2 clay-inner rounded-full md:hidden">
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="clay-card p-2 flex gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'diagnostics', icon: Camera, label: 'Diagnostics' },
          { id: 'market', icon: MapPin, label: 'Market Hub' },
          { id: 'farm', icon: Map, label: 'Farm Map' },
          { id: 'calendar', icon: Calendar, label: 'Crop Calendar' },
          { id: 'devices', icon: Cpu, label: 'Devices' },
          { id: 'insights', icon: BarChart3, label: 'Total Insight' },
          { id: 'ai-assistant', icon: Bot, label: 'AI Assistant' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl transition-all whitespace-nowrap ${
              activeTab === tab.id 
                ? 'bg-blue-600 text-white shadow-lg' 
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <tab.icon size={20} />
            <span className="font-semibold">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1">
        <AnimatePresence mode="wait">
          {activeTab === 'diagnostics' && (
            <motion.div
              key="diagnostics"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="clay-card p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
                  {image ? (
                    <div className="relative w-full aspect-video rounded-3xl overflow-hidden shadow-inner mb-6">
                      <img src={image} alt="Crop" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => {
                          setImage(null);
                          setDiagnosisResult(null);
                        }}
                        className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur rounded-full shadow-lg"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  ) : (
                    <div className="w-full h-64 bg-slate-50 rounded-3xl flex flex-col items-center justify-center border-2 border-dashed border-slate-200 mb-6 transition-colors hover:bg-slate-100/50">
                      <Camera size={48} className="text-slate-300 mb-4" />
                      <p className="text-slate-400 font-medium">Upload a photo of your crop</p>
                    </div>
                  )
                }
                  <label className="clay-button cursor-pointer flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700">
                    <Camera size={20} />
                    <span>{image ? 'Retake Photo' : 'Capture Crop'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>

                <div className="clay-card p-10 overflow-y-auto max-h-[700px] bg-white border border-slate-200/60 shadow-sm">
                  <div className="max-w-3xl mx-auto">
                    <header className="mb-8 pb-6 border-b border-slate-100">
                      <div className="flex items-center gap-3 text-blue-600 mb-2">
                        <Info size={20} />
                        <span className="text-xs font-bold uppercase tracking-widest">Analysis Report</span>
                      </div>
                      <h3 className="text-3xl font-bold text-slate-900 tracking-tight">
                        Crop Health Diagnosis
                      </h3>
                    </header>

                    {loading ? (
                      <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-slate-500 font-medium animate-pulse">Analyzing botanical patterns...</p>
                      </div>
                    ) : diagnosisResult ? (
                      <div className="prose prose-slate prose-lg max-w-none">
                        <ReactMarkdown>{diagnosisResult}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-center py-20 bg-slate-50 rounded-[32px] border border-dashed border-slate-200">
                        <Camera size={40} className="mx-auto text-slate-300 mb-4" />
                        <p className="text-slate-500 font-medium">Upload an image to generate a detailed health report.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {diagnosticsHistory.length > 0 && (
                <div className="flex flex-col gap-6">
                  <h3 className="text-xl font-bold flex items-center gap-2 px-2">
                    <Camera className="text-blue-600" />
                    Diagnosis History
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {diagnosticsHistory.map((record) => (
                      <div 
                        key={record.id}
                        className="clay-card p-4 flex flex-col gap-4 group relative"
                      >
                        <div className="relative aspect-video rounded-xl overflow-hidden shadow-inner">
                          <img src={record.image} alt="Diagnosis" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button 
                              onClick={() => {
                                setImage(record.image);
                                setDiagnosisResult(record.result);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="p-2 bg-white text-blue-600 rounded-lg font-bold text-xs"
                            >
                              View
                            </button>
                            <button 
                              onClick={() => handleDeleteDiagnosis(record.id)}
                              className="p-2 bg-white text-red-600 rounded-lg font-bold text-xs"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                            {new Date(record.createdAt).toLocaleDateString(undefined, { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                          <p className="text-xs font-medium text-slate-600 line-clamp-2">
                            {record.result.replace(/[#*`]/g, '').substring(0, 100)}...
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'market' && (
            <motion.div
              key="market"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-6"
            >
              {/* Market Hub Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 clay-card p-2 flex gap-2 overflow-x-auto no-scrollbar">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'market', label: 'Markets' },
                    { id: 'bhavan', label: 'Krishi Bhavans' },
                    { id: 'seedbank', label: 'Seed Banks' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setMarketFilter(f.id)}
                      className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap font-bold ${
                        marketFilter === f.id ? 'bg-blue-600 text-white' : 'text-slate-600'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  {markets.length === 0 && user && (
                    <button 
                      onClick={seedSampleData}
                      className="clay-button bg-blue-600 text-white flex items-center justify-center gap-2 flex-1"
                    >
                      <TrendingUp size={18} />
                      <span>Seed Data</span>
                    </button>
                  )}
                  <button 
                    onClick={() => setShowAddModal(true)}
                    className="clay-button bg-green-600 text-white flex items-center justify-center gap-2 flex-1"
                  >
                    <Leaf size={18} />
                    <span>Add Resource</span>
                  </button>
                </div>
              </div>

              <div className="clay-card p-2 flex items-center gap-2">
                <div className="clay-inner flex-1 flex items-center gap-2 px-4 py-2 rounded-xl">
                  <Info size={18} className="text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search resources..." 
                    className="bg-transparent border-none outline-none w-full text-sm font-medium"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 clay-card p-4 min-h-[600px] relative overflow-hidden bg-slate-100">
                  <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                    <MapPin size={200} className="text-blue-600" />
                  </div>
                  
                  {/* Map markers overlay simulation */}
                  {filteredMarkets.map((m, i) => (
                    <motion.button 
                      key={m.id}
                      whileHover={{ scale: 1.1 }}
                      onClick={() => setSelectedResource(m)}
                      className={`absolute p-2 rounded-xl shadow-lg flex items-center gap-2 transition-all ${
                        selectedResource?.id === m.id ? 'bg-blue-600 text-white z-10' : 'bg-white text-slate-800'
                      }`}
                      style={{ 
                        top: `${20 + (m.location.lat % 1) * 600}%`, 
                        left: `${10 + (m.location.lng % 1) * 300}%` 
                      }}
                    >
                      <div className={`w-3 h-3 rounded-full ${
                        m.type === 'market' ? 'bg-orange-500' : m.type === 'bhavan' ? 'bg-green-500' : 'bg-purple-500'
                      } ${selectedResource?.id === m.id ? 'animate-ping' : ''}`}></div>
                      <span className="text-xs font-bold">{m.name}</span>
                    </motion.button>
                  ))}

                  {selectedResource && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute bottom-4 left-4 right-4 clay-card p-6 bg-white/95 backdrop-blur-md z-20 overflow-y-auto max-h-[80%]"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="text-xl font-bold text-blue-600">{selectedResource.name}</h4>
                          <p className="text-sm text-slate-500 capitalize">{selectedResource.type.replace('bhavan', 'Krishi Bhavan')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {user && selectedResource.authorId === user.uid && (
                            <>
                              <button 
                                onClick={() => handleEditResource(selectedResource)} 
                                className="p-2 clay-inner rounded-full text-blue-600 hover:bg-blue-50 transition-colors"
                                title="Edit Resource"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteResource(selectedResource.id)} 
                                className="p-2 clay-inner rounded-full text-red-600 hover:bg-red-50 transition-colors"
                                title="Delete Resource"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                          <button onClick={() => setSelectedResource(null)} className="p-2 clay-inner rounded-full">
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="clay-inner p-3 rounded-2xl">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Contact Person</p>
                          <p className="text-xs font-bold">{selectedResource.contactPerson || 'N/A'}</p>
                        </div>
                        <div className="clay-inner p-3 rounded-2xl">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Contact Info</p>
                          <p className="text-xs font-bold">{selectedResource.contact}</p>
                        </div>
                        <div className="clay-inner p-3 rounded-2xl col-span-2">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Operating Hours</p>
                          <p className="text-xs font-bold">{selectedResource.operatingHours || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          {selectedResource.type === 'market' ? (
                            <div className="grid grid-cols-2 gap-3">
                              {Object.entries(selectedResource.prices).map(([item, price]) => (
                                <div key={item} className="clay-inner p-3 rounded-xl flex flex-col">
                                  <span className="text-xs text-slate-400 capitalize font-bold">{item}</span>
                                  <span className="text-lg font-bold text-slate-800">{price as string}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-4">
                              {selectedResource.type === 'bhavan' && selectedResource.services && (
                                <div>
                                  <h5 className="text-xs font-bold text-slate-400 uppercase mb-2">Services Offered</h5>
                                  <div className="flex flex-wrap gap-2">
                                    {selectedResource.services.map((s: string) => (
                                      <span key={s} className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-100">{s}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {selectedResource.type === 'seedbank' && selectedResource.variety && (
                                <div>
                                  <h5 className="text-xs font-bold text-slate-400 uppercase mb-2">Available Varieties</h5>
                                  <div className="flex flex-wrap gap-2">
                                    {selectedResource.variety.map((v: string) => (
                                      <span key={v} className="px-3 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold border border-purple-100">{v}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center gap-2 text-sm font-bold text-slate-600 mt-2">
                                <Info size={16} className="text-blue-600" />
                                <span>Contact: {selectedResource.contact}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-4">
                          <h5 className="font-bold text-slate-700 flex items-center gap-2">
                            <TrendingUp size={16} className="text-blue-600" />
                            Farmer Reviews
                          </h5>
                          <div className="space-y-3 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                            {selectedResource.reviews?.length > 0 ? (
                              selectedResource.reviews.map((r: any, i: number) => (
                                <div key={i} className="clay-inner p-3 rounded-xl text-sm">
                                  <div className="flex justify-between mb-1">
                                    <span className="font-bold text-blue-600">{r.user}</span>
                                    <span className="text-orange-500">{'★'.repeat(r.rating)}</span>
                                  </div>
                                  <p className="text-slate-600 italic">"{r.comment}"</p>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-slate-400 italic">No reviews yet. Be the first!</p>
                            )}
                          </div>
                          
                          <form onSubmit={handleAddReview} className="flex flex-col gap-2 mt-2">
                            <textarea 
                              placeholder="Add a review..." 
                              className="clay-inner px-3 py-2 rounded-lg text-xs outline-none h-16 resize-none"
                              value={newReview.comment}
                              onChange={(e) => setNewReview({...newReview, comment: e.target.value})}
                              required
                            />
                            <button type="submit" className="clay-button py-2 text-xs bg-blue-600 text-white">Post Review</button>
                          </form>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="flex flex-col gap-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                  <h3 className="text-xl font-bold flex items-center gap-2 px-2 sticky top-0 bg-slate-50 py-2 z-10">
                    <TrendingUp className="text-green-600" />
                    Nearby Resources
                  </h3>
                  {filteredMarkets.length > 0 ? (
                    filteredMarkets.map((market) => (
                      <div 
                        key={market.id} 
                        onClick={() => setSelectedResource(market)}
                        className={`clay-card p-6 transition-all cursor-pointer border-2 ${
                          selectedResource?.id === market.id ? 'border-blue-600' : 'border-transparent'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-bold text-lg">{market.name}</h4>
                          <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${
                            market.type === 'market' ? 'bg-orange-100 text-orange-600' : 
                            market.type === 'bhavan' ? 'bg-green-100 text-green-600' : 'bg-purple-100 text-purple-600'
                          }`}>
                            {market.type}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-1">
                            <span className="text-orange-500 text-xs">★</span>
                            <span className="text-xs font-bold text-slate-500">
                              {market.reviews?.length > 0 
                                ? (market.reviews.reduce((acc: any, r: any) => acc + r.rating, 0) / market.reviews.length).toFixed(1)
                                : '0.0'}
                            </span>
                          </div>
                          <ChevronRight size={20} className="text-slate-300" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      <p>No resources found matching your search.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'farm' && (
            <motion.div
              key="farm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center px-4">
                <div>
                  <h2 className="text-4xl font-black text-slate-800 tracking-tighter">Farm Map</h2>
                  <p className="text-slate-500 font-bold text-sm uppercase tracking-widest mt-1">Interactive Layout & Device Placement</p>
                </div>
              </div>

              <FarmMap />
            </motion.div>
          )}

          {activeTab === 'calendar' && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-8"
            >
              <div className="clay-card p-8 bg-white border border-slate-200/60 shadow-sm">
                <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 text-blue-600 mb-2">
                      <Calendar size={20} />
                      <span className="text-xs font-bold uppercase tracking-widest">Crop Calendar</span>
                    </div>
                    <h3 className="text-3xl font-bold text-slate-900 tracking-tight">
                      {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                      <button 
                        onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}
                        className="p-2 hover:bg-white rounded-lg transition-colors"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button 
                        onClick={() => setCurrentMonth(new Date())}
                        className="px-3 py-1 text-xs font-bold text-slate-600 hover:bg-white rounded-lg transition-colors"
                      >
                        Today
                      </button>
                      <button 
                        onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}
                        className="p-2 hover:bg-white rounded-lg transition-colors"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                    <button 
                      onClick={() => {
                        setSelectedEvent(null);
                        setNewEvent({
                          title: '',
                          date: new Date().toISOString().split('T')[0],
                          description: '',
                          type: 'planting'
                        });
                        setShowEventModal(true);
                      }}
                      className="clay-button bg-blue-600 text-white px-4 py-2 text-sm flex items-center gap-2"
                    >
                      <Plus size={18} />
                      Add Task
                    </button>
                  </div>
                </header>

                <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="bg-slate-50 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {day}
                    </div>
                  ))}
                  {getDaysInMonth(currentMonth).map((date, i) => {
                    const dateStr = date ? date.toISOString().split('T')[0] : null;
                    const dayEvents = calendarEvents.filter(e => e.date === dateStr);
                    const isToday = dateStr === new Date().toISOString().split('T')[0];

                    return (
                      <div 
                        key={i} 
                        className={`min-h-[120px] bg-white p-2 flex flex-col gap-1 transition-colors ${
                          !date ? 'bg-slate-50/50' : 'hover:bg-slate-50/50'
                        }`}
                      >
                        {date && (
                          <>
                            <span className={`text-xs font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                              isToday ? 'bg-blue-600 text-white' : 'text-slate-400'
                            }`}>
                              {date.getDate()}
                            </span>
                            <div className="flex flex-col gap-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                              {dayEvents.map(event => (
                                <div 
                                  key={event.id}
                                  onClick={() => handleEditEvent(event)}
                                  className={`text-[10px] p-1.5 rounded-lg font-bold truncate cursor-pointer transition-transform hover:scale-[1.02] ${
                                    event.type === 'planting' ? 'bg-green-100 text-green-700 border border-green-200' :
                                    event.type === 'harvesting' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                                    event.type === 'fertilizing' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                                    event.type === 'irrigation' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                    'bg-slate-100 text-slate-700 border border-slate-200'
                                  }`}
                                >
                                  {event.title}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'insights' && (
            <motion.div
              key="insights"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center px-4">
                <div>
                  <h2 className="text-4xl font-black text-slate-800 tracking-tighter">Total Insight</h2>
                  <p className="text-slate-500 font-bold text-sm uppercase tracking-widest mt-1">Farm Performance & Analytics</p>
                </div>
              </div>
              <InsightDashboard />
            </motion.div>
          )}

          {activeTab === 'ai-assistant' && (
            <motion.div
              key="ai-assistant"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center px-4">
                <div>
                  <h2 className="text-4xl font-black text-slate-800 tracking-tighter">AI Assistant</h2>
                  <p className="text-slate-500 font-bold text-sm uppercase tracking-widest mt-1">Your Personal Farming Expert</p>
                </div>
              </div>
              <AIAssistant />
            </motion.div>
          )}

        </AnimatePresence>

        {/* Global Modals */}
        <AnimatePresence>
          {showAddModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="clay-card p-8 w-full max-w-md"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-bold text-blue-600">
                    {selectedResource && showAddModal ? 'Edit Resource' : 'Add New Resource'}
                  </h3>
                  <button 
                    onClick={() => {
                      setShowAddModal(false);
                      setSelectedResource(null);
                      setNewResource({ 
                        name: '', 
                        type: 'market', 
                        contact: '', 
                        contactPerson: '',
                        operatingHours: '',
                        services: '',
                        prices: '',
                        variety: ''
                      });
                    }} 
                    className="p-2 clay-inner rounded-full"
                  >
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={handleAddResource} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 px-2">Resource Name</label>
                    <input 
                      type="text" 
                      className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                      value={newResource.name}
                      onChange={(e) => setNewResource({...newResource, name: e.target.value})}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 px-2">Type</label>
                    <select 
                      className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium appearance-none"
                      value={newResource.type}
                      onChange={(e) => setNewResource({...newResource, type: e.target.value})}
                    >
                      <option value="market">Market</option>
                      <option value="bhavan">Krishi Bhavan</option>
                      <option value="seedbank">Seed Bank</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 px-2">Contact Person</label>
                    <input 
                      type="text" 
                      className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                      value={newResource.contactPerson}
                      onChange={(e) => setNewResource({...newResource, contactPerson: e.target.value})}
                      placeholder="e.g. Mr. Raghavan"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 px-2">Contact Info</label>
                    <input 
                      type="text" 
                      className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                      value={newResource.contact}
                      onChange={(e) => setNewResource({...newResource, contact: e.target.value})}
                      placeholder="Phone number"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 px-2">Operating Hours</label>
                    <input 
                      type="text" 
                      className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                      value={newResource.operatingHours}
                      onChange={(e) => setNewResource({...newResource, operatingHours: e.target.value})}
                      placeholder="e.g. 9:00 AM - 5:00 PM"
                      required
                    />
                  </div>
                  {newResource.type === 'market' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 px-2">Prices (e.g. coconut: ₹30/kg, rubber: ₹150/kg)</label>
                      <input 
                        type="text" 
                        className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                        value={newResource.prices}
                        onChange={(e) => setNewResource({...newResource, prices: e.target.value})}
                        placeholder="item: price, item: price"
                      />
                    </div>
                  )}
                  {newResource.type === 'bhavan' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 px-2">Services (comma separated)</label>
                      <input 
                        type="text" 
                        className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                        value={newResource.services}
                        onChange={(e) => setNewResource({...newResource, services: e.target.value})}
                        placeholder="e.g. Soil Testing, Seed Bank"
                      />
                    </div>
                  )}
                  {newResource.type === 'seedbank' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 px-2">Varieties (comma separated)</label>
                      <input 
                        type="text" 
                        className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                        value={newResource.variety}
                        onChange={(e) => setNewResource({...newResource, variety: e.target.value})}
                        placeholder="e.g. High Yield Paddy, Hybrid Coconut"
                      />
                    </div>
                  )}
                  <button type="submit" className="clay-button bg-blue-600 text-white py-4 mt-4 text-lg">
                    {selectedResource && showAddModal ? 'Update Resource' : 'Create Resource'}
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showEventModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="clay-card p-8 w-full max-w-md"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-bold text-blue-600">{selectedEvent ? 'Edit Task' : 'Add New Task'}</h3>
                  <button onClick={() => setShowEventModal(false)} className="p-2 clay-inner rounded-full">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={handleAddEvent} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 px-2">Task Title</label>
                    <input 
                      type="text" 
                      className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                      value={newEvent.title}
                      onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
                      placeholder="e.g. Plant Coconut Saplings"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 px-2">Date</label>
                    <input 
                      type="date" 
                      className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                      value={newEvent.date}
                      onChange={(e) => setNewEvent({...newEvent, date: e.target.value})}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 px-2">Type</label>
                    <select 
                      className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium appearance-none"
                      value={newEvent.type}
                      onChange={(e) => setNewEvent({...newEvent, type: e.target.value as any})}
                    >
                      <option value="planting">Planting</option>
                      <option value="harvesting">Harvesting</option>
                      <option value="fertilizing">Fertilizing</option>
                      <option value="irrigation">Irrigation</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 px-2">Description</label>
                    <textarea 
                      className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium h-24 resize-none"
                      value={newEvent.description}
                      onChange={(e) => setNewEvent({...newEvent, description: e.target.value})}
                      placeholder="Add more details..."
                    />
                  </div>
                  <div className="flex gap-3 mt-4">
                    {selectedEvent && (
                      <button 
                        type="button"
                        onClick={() => handleDeleteEvent(selectedEvent.id)}
                        className="flex-1 clay-button bg-red-50 text-red-600 py-4 font-bold flex items-center justify-center gap-2"
                      >
                        <Trash2 size={18} />
                        Delete
                      </button>
                    )}
                    <button type="submit" className="flex-[2] clay-button bg-blue-600 text-white py-4 font-bold">
                      {selectedEvent ? 'Update Task' : 'Add Task'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showFieldModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="clay-card p-8 w-full max-w-md"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-bold text-blue-600">{selectedField ? 'Edit Field' : 'Add New Field'}</h3>
                  <button onClick={() => setShowFieldModal(false)} className="p-2 clay-inner rounded-full">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={handleAddField} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 px-2">Field Name</label>
                    <input 
                      type="text" 
                      className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                      value={newField.name}
                      onChange={(e) => setNewField({...newField, name: e.target.value})}
                      placeholder="e.g. North Coconut Grove"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 px-2">Crop Type</label>
                    <input 
                      type="text" 
                      className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                      value={newField.crop}
                      onChange={(e) => setNewField({...newField, crop: e.target.value})}
                      placeholder="e.g. Coconut, Rubber, Banana"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 px-2">Area (Acres)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                      value={isNaN(newField.area) ? '' : newField.area}
                      onChange={(e) => setNewField({...newField, area: parseFloat(e.target.value)})}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 px-2">Latitude</label>
                      <input 
                        type="number" 
                        step="0.0001"
                        className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                        value={isNaN(newField.location.lat) ? '' : newField.location.lat}
                        onChange={(e) => setNewField({...newField, location: {...newField.location, lat: parseFloat(e.target.value)}})}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 px-2">Longitude</label>
                      <input 
                        type="number" 
                        step="0.0001"
                        className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                        value={isNaN(newField.location.lng) ? '' : newField.location.lng}
                        onChange={(e) => setNewField({...newField, location: {...newField.location, lng: parseFloat(e.target.value)}})}
                        required
                      />
                    </div>
                  </div>
                  <button type="submit" className="clay-button bg-blue-600 text-white py-4 mt-4 font-bold text-lg">
                    {selectedField ? 'Update Field' : 'Add Field'}
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}

          {showSoilModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="clay-card p-8 w-full max-w-md"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-bold text-green-600">Soil Health Analysis</h3>
                  <button onClick={() => setShowSoilModal(false)} className="p-2 clay-inner rounded-full">
                    <X size={20} />
                  </button>
                </div>
                <p className="text-xs text-slate-500 mb-6 font-medium">
                  Enter your latest soil test results for <span className="font-bold text-slate-700">{selectedField?.name}</span>.
                </p>
                <form onSubmit={handleSoilAnalysis} className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 px-2">pH Level</label>
                      <input 
                        type="number" 
                        step="0.1"
                        className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                        value={soilHealthInput.ph}
                        onChange={(e) => setSoilHealthInput({...soilHealthInput, ph: parseFloat(e.target.value)})}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 px-2">Nitrogen (N)</label>
                      <input 
                        type="number" 
                        className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                        value={soilHealthInput.nitrogen}
                        onChange={(e) => setSoilHealthInput({...soilHealthInput, nitrogen: parseFloat(e.target.value)})}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 px-2">Phosphorus (P)</label>
                      <input 
                        type="number" 
                        className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                        value={soilHealthInput.phosphorus}
                        onChange={(e) => setSoilHealthInput({...soilHealthInput, phosphorus: parseFloat(e.target.value)})}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 px-2">Potassium (K)</label>
                      <input 
                        type="number" 
                        className="clay-inner px-4 py-3 rounded-2xl outline-none font-medium"
                        value={soilHealthInput.potassium}
                        onChange={(e) => setSoilHealthInput({...soilHealthInput, potassium: parseFloat(e.target.value)})}
                        required
                      />
                    </div>
                  </div>
                  <button 
                    type="submit" 
                    disabled={soilAnalysisLoading}
                    className={`clay-button bg-green-600 text-white py-4 mt-4 font-bold text-lg flex items-center justify-center gap-2 ${soilAnalysisLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {soilAnalysisLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Analyzing Soil...
                      </>
                    ) : (
                      <>
                        <TrendingUp size={20} />
                        Get AI Recommendations
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
          {activeTab === 'devices' && (
            <motion.div
              key="devices"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <DeviceManager />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-8 text-center text-slate-400 text-sm font-medium">
        <p>© 2026 AgriPulse Kerala • Localized AI for Sustainable Farming</p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
