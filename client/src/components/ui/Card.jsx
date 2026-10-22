import React from 'react';

export const Card = ({
  children,
  className = '',
  title,
  subtitle,
  action,
  onClick
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow transition-all duration-200 ${className}`}
    >
      {(title || subtitle || action) && (
        <div className="flex items-start justify-between mb-5 border-b border-slate-100 pb-3.5">
          <div>
            {title && <h3 className="text-base font-bold text-slate-900 tracking-tight">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 ml-3">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
