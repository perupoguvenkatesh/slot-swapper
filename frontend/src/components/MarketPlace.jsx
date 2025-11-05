import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Marketplace() {
  const { api } = useAuth();
  const [swappableSlots, setSwappableSlots] = useState([]);
  const [mySwappableSlots, setMySwappableSlots] = useState([]);
  const [selectedTheirSlot, setSelectedTheirSlot] = useState(null); // The slot I want
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [swappableRes, myEventsRes] = await Promise.all([
        api.get('/swappable-slots'),
        api.get('/my-events')
      ]);
      setSwappableSlots(swappableRes.data);
      setMySwappableSlots(myEventsRes.data.filter(event => event.status === 'SWAPPABLE'));
    } catch (err) {
      console.error("Error fetching data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRequestSwap = async (mySlotId) => {
    try {
      await api.post('/swap-request', {
        mySlotId: mySlotId,
        theirSlotId: selectedTheirSlot.id
      });
      alert('Swap request sent!');
      setSelectedTheirSlot(null); // Close modal
      fetchData(); // Refresh data
    } catch (err) {
      console.error("Error sending swap request:", err);
      alert('Failed to send swap request: ' + (err.response?.data?.message || 'Server error'));
    }
  };

  if (loading) return <div>Loading marketplace...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Marketplace</h1>
      <p>Here are all the slots available for swapping from other users.</p>

      {/* Available Slots List */}
      <div className="bg-white p-6 shadow rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Available Slots</h2>
        <ul className="space-y-4">
          {swappableSlots.length === 0 && <p>No slots are currently available for swapping.</p>}
          {swappableSlots.map((slot) => (
            <li key={slot.id} className="flex justify-between items-center p-4 border rounded-lg">
              <div>
                <strong className="text-lg">{slot.title}</strong>
                <p className="text-sm text-gray-600">
                  {new Date(slot.startTime).toLocaleString()} - {new Date(slot.endTime).toLocaleString()}
                </p>
                <p className="text-sm font-medium text-gray-800">Owner: {slot.ownerName}</p>
              </div>
              <button
                onClick={() => setSelectedTheirSlot(slot)}
                className="rounded-md bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700"
              >
                Request Swap
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Swap Request Modal */}
      {selectedTheirSlot && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Request a Swap</h3>
            <p className="mb-2">You want to swap for:</p>
            <div className="p-3 bg-gray-100 rounded-md mb-4">
              <strong>{selectedTheirSlot.title}</strong> ({selectedTheirSlot.ownerName})<br />
              <span className="text-sm">{new Date(selectedTheirSlot.startTime).toLocaleString()}</span>
            </div>
            <p className="mb-2">Which of your swappable slots do you want to offer?</p>
            
            {mySwappableSlots.length === 0 ? (
              <p className="text-red-600">You have no swappable slots to offer. Go to your Dashboard to make a slot swappable.</p>
            ) : (
              <ul className="space-y-2 max-h-60 overflow-y-auto">
                {mySwappableSlots.map((mySlot) => (
                  <li key={mySlot.id} className="flex justify-between items-center p-3 border rounded-md">
                    <div>
                      <strong>{mySlot.title}</strong><br />
                      <span className="text-sm">{new Date(mySlot.startTime).toLocaleString()}</span>
                    </div>
                    <button
                      onClick={() => handleRequestSwap(mySlot.id)}
                      className="rounded-md bg-green-600 text-white px-3 py-1 text-sm hover:bg-green-700"
                    >
                      Offer This Slot
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 text-right">
              <button
                onClick={() => setSelectedTheirSlot(null)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}