import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { api } = useAuth();
  const [myEvents, setMyEvents] = useState([]);
  const [formData, setFormData] = useState({ title: '', startTime: '', endTime: '' });

  const fetchEvents = async () => {
    try {
      const res = await api.get('/my-events');
      setMyEvents(res.data);
    } catch (err) {
      console.error("Error fetching events:", err);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Simple date conversion to ISO string for storage
      const newEvent = {
        title: formData.title,
        startTime: new Date(formData.startTime).toISOString(),
        endTime: new Date(formData.endTime).toISOString(),
      };
      await api.post('/events', newEvent);
      fetchEvents(); // Refresh list
      setFormData({ title: '', startTime: '', endTime: '' }); // Clear form
    } catch (err) {
      console.error("Error creating event:", err);
    }
  };

  const handleSetStatus = async (eventId, newStatus) => {
    try {
      await api.put(`/events/${eventId}/status`, { status: newStatus });
      fetchEvents(); // Refresh list
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">My Dashboard</h1>
      
      {/* Create Event Form */}
      <div className="bg-white p-6 shadow rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Create New Event</h2>
        <form className="grid grid-cols-1 gap-4 md:grid-cols-4" onSubmit={handleSubmit}>
          <input
            name="title" value={formData.title} onChange={handleChange}
            placeholder="Event Title" required
            className="rounded-md"
          />
          <input
            name="startTime" value={formData.startTime} onChange={handleChange}
            type="datetime-local" required
            className="rounded-md"
          />
          <input
            name="endTime" value={formData.endTime} onChange={handleChange}
            type="datetime-local" required
            className="rounded-md"
          />
          <button type="submit" className="rounded-md bg-indigo-600 text-white px-4 py-2 hover:bg-indigo-700">
            Create Event
          </button>
        </form>
      </div>

      {/* My Events List */}
      <div className="bg-white p-6 shadow rounded-lg">
        <h2 className="text-xl font-semibold mb-4">My Events</h2>
        <ul className="space-y-4">
          {myEvents.length === 0 && <p>You have no events.</p>}
          {myEvents.map((event) => (
            <li key={event.id} className="flex justify-between items-center p-4 border rounded-lg">
              <div>
                <strong className="text-lg">{event.title}</strong>
                <p className="text-sm text-gray-600">
                  {new Date(event.startTime).toLocaleString()} - {new Date(event.endTime).toLocaleString()}
                </p>
                <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                  event.status === 'BUSY' ? 'bg-red-200 text-red-800' :
                  event.status === 'SWAPPABLE' ? 'bg-green-200 text-green-800' :
                  'bg-yellow-200 text-yellow-800'
                }`}>
                  {event.status}
                </span>
              </div>
              <div>
                {event.status === 'BUSY' && (
                  <button onClick={() => handleSetStatus(event.id, 'SWAPPABLE')} className="ml-4 rounded-md bg-green-500 text-white px-3 py-1 text-sm hover:bg-green-600">
                    Make Swappable
                  </button>
                )}
                {event.status === 'SWAPPABLE' && (
                  <button onClick={() => handleSetStatus(event.id, 'BUSY')} className="ml-4 rounded-md bg-red-500 text-white px-3 py-1 text-sm hover:bg-red-600">
                    Make Busy
                  </button>
                )}
                {event.status === 'SWAP_PENDING' && (
                  <span className="ml-4 text-sm font-medium text-gray-500">Pending...</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}