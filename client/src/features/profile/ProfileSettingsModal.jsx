import React, { useState } from 'react';
import {
  User,
  Settings,
  LogOut,
  X,
  Shield,
  Moon,
  CheckCircle2
} from 'lucide-react';
import { Button } from '../../components/ui/Button';

export const ProfileSettingsModal = ({
  isOpen,
  onClose,
  currentUser,
  onLogout
}) => {
  const [defaultLang, setDefaultLang] = useState('java');
  const [savedNotice, setSavedNotice] = useState(false);

  if (!isOpen) return null;

  const handleSavePreferences = (e) => {
    e.preventDefault();
    localStorage.setItem('testforge_pref_lang', defaultLang);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-orange-500/20">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">Faculty Account & Settings</h3>
              <p className="text-xs text-slate-500">Manage profile details, execution parameters, and session</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* User Profile Card */}
          <div className="p-4 rounded-2xl bg-orange-50/60 border border-orange-200/80 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-orange-600 text-white flex items-center justify-center font-extrabold text-xl shadow-md shadow-orange-500/20 shrink-0">
              {currentUser?.name ? currentUser.name[0] : 'T'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-extrabold text-slate-900 text-base truncate">
                  {currentUser?.name || 'Faculty Member'}
                </span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-orange-200/60 text-orange-800 border border-orange-300">
                  {currentUser?.role || 'Instructor'}
                </span>
              </div>
              <p className="text-xs text-slate-600 truncate">{currentUser?.email || 'teacher@testforge.edu'}</p>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500 font-medium">
                <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                  <Shield className="h-3.5 w-3.5" /> 30-Day Session Active
                </span>
                <span>•</span>
                <span>Role: Faculty Access</span>
              </div>
            </div>
          </div>

          {/* Platform Settings Form */}
          <form onSubmit={handleSavePreferences} className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2">
              <Settings className="h-4 w-4 text-orange-600" />
              <span>Assessment & Runner Preferences</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Default Problem Language
              </label>
              <select
                value={defaultLang}
                onChange={(e) => setDefaultLang(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-orange-500"
              >
                <option value="java">Java (Universal Harness)</option>
                <option value="javascript">JavaScript (Node VM)</option>
                <option value="python">Python 3 (Isolated Runner)</option>
              </select>
            </div>

            {/* Theme Mode Status */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-700 font-semibold">
                <Moon className="h-4 w-4 text-amber-500 fill-amber-400" />
                <span>Interface Theme:</span>
              </div>
              <span className="font-bold flex items-center gap-1.5 text-amber-500">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Dark Theme Active
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                {savedNotice && (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Preferences saved!
                  </>
                )}
              </div>
              <Button type="submit" size="sm" variant="secondary">
                Save Preferences
              </Button>
            </div>
          </form>

          {/* Dedicated Logout Section */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between bg-rose-50/40 p-4 rounded-2xl border border-rose-100">
            <div>
              <span className="block text-xs font-extrabold text-slate-900">Logout from Account</span>
              <span className="block text-[11px] text-slate-500">Terminates active faculty session on this device</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold text-xs transition-all cursor-pointer shadow-md shadow-rose-600/30 hover:shadow-lg"
            >
              <LogOut className="h-4 w-4 text-white" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettingsModal;
