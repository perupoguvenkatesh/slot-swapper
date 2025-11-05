import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
const API_URL = 'https://slot-swapper-9jdw.onrender.com/api'; 
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (token) {
            try {
                setUser({ token });
            } catch (error) {
                localStorage.removeItem('token');
                setToken(null);
            }
        }
        setLoading(false);
    }, [token]);

    const api = axios.create({
        baseURL: API_URL,
        headers: {
            'Content-Type': 'application/json',
        }
    });

    // Add a request interceptor to attach the token
    api.interceptors.request.use((config) => {
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    });

    const login = async (email, password) => {
        const res = await api.post('/login', { email, password });
        localStorage.setItem('token', res.data.token);
        setToken(res.data.token);
        setUser({ token: res.data.token });
    };

    const signup = async (name, email, password) => {
        const res = await api.post('/signup', { name, email, password });
        localStorage.setItem('token', res.data.token);
        setToken(res.data.token);
        setUser({ token: res.data.token });
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    };

    const value = {
        user,
        token,
        loading,
        api, // Provide the pre-configured axios instance
        login,
        signup,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
