import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      {/* For now, redirect the root directly to login */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      
      {/* Placeholder for the dashboard when we build it */}
      <Route path="/dashboard" element={<div className="p-10 text-white font-display text-4xl">Dashboard Under Construction</div>} />
    </Routes>
  );
}

export default App;