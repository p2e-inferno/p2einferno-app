import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface MilestoneTimerProps {
  startDate?: string;
  endDate?: string;
  isExpired?: boolean;
  className?: string;
}

export default function MilestoneTimer({ 
  startDate, 
  endDate, 
  isExpired: _isExpired = false,
  className = "" 
}: MilestoneTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  const [status, setStatus] = useState<'not_started' | 'active' | 'expired'>('not_started');

  useEffect(() => {
    if (!endDate) return;

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const endTime = new Date(endDate).getTime();
      const startTime = startDate ? new Date(startDate).getTime() : 0;

      // Determine status
      if (now < startTime) {
        setStatus('not_started');
      } else if (now > endTime) {
        setStatus('expired');
        setTimeLeft(null);
        return;
      } else {
        setStatus('active');
      }

      const difference = endTime - now;

      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        setTimeLeft({ days, hours, minutes, seconds });
      } else {
        setStatus('expired');
        setTimeLeft(null);
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [startDate, endDate]);

  if (!endDate) return null;

  const getStatusConfig = () => {
    switch (status) {
      case 'not_started':
        return {
          bgColor: 'bg-blue-900/20',
          borderColor: 'border-blue-500/20',
          textColor: 'text-blue-300',
          icon: Clock,
          label: 'Starts Soon'
        };
      case 'active':
        return {
          bgColor: timeLeft?.days && timeLeft.days < 2 ? 'bg-orange-900/20' : 'bg-green-900/20',
          borderColor: timeLeft?.days && timeLeft.days < 2 ? 'border-orange-500/20' : 'border-green-500/20',
          textColor: timeLeft?.days && timeLeft.days < 2 ? 'text-orange-300' : 'text-green-300',
          icon: Clock,
          label: timeLeft?.days && timeLeft.days < 2 ? 'Ending Soon' : 'Active'
        };
      case 'expired':
        return {
          bgColor: 'bg-red-900/20',
          borderColor: 'border-red-500/20',
          textColor: 'text-red-300',
          icon: AlertTriangle,
          label: 'Rewards Expired'
        };
    }
  };

  const config = getStatusConfig();
  const IconComponent = config.icon;

  const formatTimeLeft = () => {
    if (!timeLeft) return null;
    
    if (timeLeft.days > 0) {
      return `${timeLeft.days}d ${timeLeft.hours}h`;
    } else if (timeLeft.hours > 0) {
      return `${timeLeft.hours}h ${timeLeft.minutes}m`;
    } else {
      return `${timeLeft.minutes}m ${timeLeft.seconds}s`;
    }
  };

  return (
    <div className={`${config.bgColor} ${config.borderColor} border rounded-lg p-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <IconComponent size={16} className={config.textColor} />
          <span className={`text-sm font-medium ${config.textColor}`}>
            {config.label}
          </span>
        </div>
        
        {timeLeft && (
          <div className={`text-sm font-mono font-bold ${config.textColor}`}>
            {formatTimeLeft()}
          </div>
        )}
      </div>
      
      {status === 'expired' && (
        <div className="mt-2 text-xs text-faded-grey">
          Tasks can still be completed but rewards are no longer available
        </div>
      )}
      
      {status === 'not_started' && startDate && (
        <div className="mt-2 text-xs text-faded-grey">
          Available from {new Date(startDate).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}