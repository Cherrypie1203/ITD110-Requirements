import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { saveUser, getUser, saveToken, getToken, removeUser, removeToken } from '../utils/storage';
import { apiRequest } from '../utils/api';

const AuthContext = createContext();

const normalizeUser = (user) => ({
  id: user._id || user.id,
  fullName: user.fullName || '',
  username: user.username || '',
  email: user.email || '',
  mobileNumber: user.mobileNumber || '',
  profilePhoto: user.profilePhoto || '',
  gender: user.gender || '',
  profession: user.profession || '',
});

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mockUsers, setMockUsers] = useState([]);

  useEffect(() => {
    void loadSession();
  }, []);

  const syncUsers = async (authToken, sessionUser = null) => {
    try {
      const users = await apiRequest('/users/all', { method: 'GET' }, authToken);
      const normalizedUsers = Array.isArray(users) ? users.map(normalizeUser) : [];
      const nextUsers = sessionUser
        ? [sessionUser, ...normalizedUsers.filter((user) => user.id !== sessionUser.id)]
        : normalizedUsers;

      setMockUsers(nextUsers);
    } catch (error) {
      console.error('Error loading users:', error);
      if (sessionUser) {
        setMockUsers([sessionUser]);
      }
    }
  };

  const loadSession = async () => {
    try {
      const [storedUser, storedToken] = await Promise.all([getUser(), getToken()]);

      if (!storedUser || !storedToken) {
        setLoading(false);
        return;
      }

      const normalizedStoredUser = normalizeUser(storedUser);
      setCurrentUser(normalizedStoredUser);
      setToken(storedToken);

      try {
        const remoteUser = await apiRequest('/users/me', { method: 'GET' }, storedToken);
        const normalizedRemoteUser = normalizeUser(remoteUser);
        setCurrentUser(normalizedRemoteUser);
        await saveUser(normalizedRemoteUser);
        await syncUsers(storedToken, normalizedRemoteUser);
      } catch (error) {
        if (error.message === 'Invalid authentication token' || error.message === 'User not found') {
          await Promise.all([removeUser(), removeToken()]);
          setCurrentUser(null);
          setToken(null);
          setMockUsers([]);
          return;
        }

        setMockUsers([normalizedStoredUser]);
      }
    } catch (error) {
      console.error('Error loading session:', error);
      setCurrentUser(null);
      setToken(null);
      setMockUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const persistSession = async (user, authToken) => {
    const sessionUser = normalizeUser(user);
    setCurrentUser(sessionUser);
    setToken(authToken);
    await Promise.all([saveUser(sessionUser), saveToken(authToken)]);
    await syncUsers(authToken, sessionUser);
  };

  const login = async (emailOrMobile, password) => {
    try {
      const payload = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          emailOrMobile: emailOrMobile.trim(),
          password,
        }),
      });

      await persistSession(payload.user, payload.token);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  const signup = async (fullName, username, email, password) => {
    try {
      const payload = await apiRequest('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
          mobileNumber: '',
        }),
      });

      await persistSession(payload.user, payload.token);
      return { success: true, message: payload.message || 'Registered successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  const logout = async () => {
    try {
      setCurrentUser(null);
      setToken(null);
      setMockUsers([]);
      await Promise.all([removeUser(), removeToken()]);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const updateProfile = async (updates) => {
    try {
      if (!currentUser || !token) {
        return { success: false, message: 'No user is logged in' };
      }

      const payload = await apiRequest(
        '/users/profile',
        {
          method: 'PUT',
          body: JSON.stringify(updates),
        },
        token
      );

      const updatedUser = normalizeUser(payload);
      setCurrentUser(updatedUser);
      setMockUsers((prev) =>
        prev.map((user) => (user.id === updatedUser.id ? updatedUser : user))
      );
      await saveUser(updatedUser);

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  const value = useMemo(
    () => ({
      currentUser,
      token,
      loading,
      mockUsers,
      login,
      signup,
      logout,
      updateProfile,
    }),
    [currentUser, token, loading, mockUsers]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
