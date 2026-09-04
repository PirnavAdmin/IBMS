import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const useAuthNav = () => {
  const navigate = useNavigate();
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleNav = (to, state) => {
    setIsExiting(true);
    setTimeout(() => {
      navigate(to, { state });
      window.scrollTo(0, 0);
    }, 140);
  };

  return { navigate, handleNav, isExiting };
};

export default useAuthNav;