export const getDisplayName = (user) => {
  const values = [user?.name, user?.displayName, user?.fullName, user?.userName, user?.email?.split('@')[0]];
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || 'User';
};

export const getInitials = (userName) => {
  const parts = typeof userName === 'string' ? userName.trim().split(/\s+/).filter(Boolean) : [];
  if (!parts.length) return 'U';
  return (Array.from(parts[0])[0] + (parts.length > 1 ? Array.from(parts[parts.length - 1])[0] : '')).toUpperCase();
};
