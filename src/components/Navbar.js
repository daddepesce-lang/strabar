'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { Beer, Map, PlusCircle, User, Award, LogOut, LogIn } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Carica l'utente corrente all'avvio e ad ogni cambio di pagina
    const checkUser = async () => {
      try {
        const currentUser = await db.getCurrentUser();
        setUser(currentUser);
      } catch (err) {
        console.error("Errore nel caricamento dell'utente:", err);
      }
    };
    checkUser();
    
    // Ascolta eventi custom di login/logout/upgrade
    const handleAuthChange = () => checkUser();
    window.addEventListener('auth-change', handleAuthChange);
    return () => window.removeEventListener('auth-change', handleAuthChange);
  }, [pathname]);

  const handleLogout = async () => {
    await db.logout();
    setUser(null);
    window.dispatchEvent(new Event('auth-change'));
    router.push('/auth');
  };

  return (
    <nav className="navbar">
      <Link href="/" className="nav-brand">
        <Beer size={28} fill="#FF5E00" color="#FF5E00" />
        STRA<span>BAR</span>
      </Link>

      <div className="nav-links">
        <Link href="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>
          <Beer size={18} />
          Feed
        </Link>
        <Link href="/routes" className={`nav-link ${pathname === '/routes' ? 'active' : ''}`}>
          <Map size={18} />
          Percorsi
        </Link>
        <Link href="/log" className={`nav-link ${pathname === '/log' ? 'active' : ''}`}>
          <PlusCircle size={18} />
          Registra
        </Link>
        <Link href="/profile" className={`nav-link ${pathname === '/profile' ? 'active' : ''}`}>
          <User size={18} />
          Profilo
        </Link>
      </div>

      <div className="nav-actions">
        {user ? (
          <>
            {user.is_premium ? (
              <span className="badge-premium">
                <Award size={12} />
                Premium
              </span>
            ) : (
              <Link href="/premium" className="btn btn-premium btn-sm" style={{ padding: '6px 14px', fontSize: '12px' }}>
                Passa a Premium
              </Link>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#FFF' }}>
                {user.display_name}
              </span>
              <button onClick={handleLogout} className="action-btn" title="Esci">
                <LogOut size={18} />
              </button>
            </div>
          </>
        ) : (
          <Link href="/auth" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '14px', borderRadius: '20px' }}>
            <LogIn size={16} />
            Accedi
          </Link>
        )}
      </div>
    </nav>
  );
}
