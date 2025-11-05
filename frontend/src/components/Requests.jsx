import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Requests() {
  const { api } = useAuth();
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get('/requests');
      setIncoming(res.data.incoming);
      setOutgoing(res.data.outgoing);
    } catch (err) {
      console.error("Error fetching requests:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleResponse = async (requestId, accept) => {
    try {
      await api.post(`/swap-response/${requestId}`, { accept });
      alert(`Swap ${accept ? 'accepted' : 'rejected'}!`);
      fetchRequests(); // Refresh
    } catch (err) {
      console.error("Error responding to swap:", err);
      alert('Failed to respond to swap: ' + (err.response?.data?.message || 'Server error'));
    }
  };

  if (loading) return <div>Loading requests...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">My Swap Requests</h1>

      {/* Incoming Requests */}
      <div className="bg-white p-6 shadow rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Incoming Requests (Awaiting Your Response)</h2>
        <ul className="space-y-4">
          {incoming.length === 0 && <p>You have no incoming swap requests.</p>}
          {incoming.map((req) => (
            <li key={req.id} className="p-4 border rounded-lg">
              <p className="mb-2">
                <strong>{req.requesterName}</strong> wants to swap their slot:
                <br />
                <span className="text-indigo-600 ml-4">{req.offeredSlotTitle} ({new Date(req.offeredSlotStart).toLocaleString()})</span>
              </p>
              <p className="mb-4">
                ...for your slot:
                <br />
                <span className="text-green-600 ml-4">{req.requestedSlotTitle} ({new Date(req.requestedSlotStart).toLocaleString()})</span>
              </p>
              <div className="flex space-x-4">
                <button
                  onClick={() => handleResponse(req.id, true)}
                  className="rounded-md bg-green-600 text-white px-4 py-2 text-sm hover:bg-green-700"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleResponse(req.id, false)}
                  className="rounded-md bg-red-600 text-white px-4 py-2 text-sm hover:bg-red-700"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Outgoing Requests */}
      <div className="bg-white p-6 shadow rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Outgoing Requests (Awaiting Their Response)</h2>
        <ul className="space-y-4">
          {outgoing.length === 0 && <p>You have no pending outgoing requests.</p>}
          {outgoing.map((req) => (
            <li key={req.id} className="p-4 border rounded-lg bg-gray-50">
              <p className="mb-2">
                You offered your slot:
                <br />
                <span className="text-indigo-600 ml-4">{req.offeredSlotTitle} ({new Date(req.offeredSlotStart).toLocaleString()})</span>
              </p>
              <p className="mb-2">
                ...for <strong>{req.ownerName}</strong>'s slot:
                <br />
                <span className="text-green-600 ml-4">{req.requestedSlotTitle} ({new Date(req.requestedSlotStart).toLocaleString()})</span>
              </p>
              <p className="font-semibold text-yellow-700">Status: {req.status}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}