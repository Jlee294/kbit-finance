'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './modal';
import { Button } from './button';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title = 'Xac nhan',
  message,
  confirmLabel = 'Xac nhan',
  cancelLabel = 'Huy',
  variant = 'default',
  onConfirm,
  onCancel,
  loading = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? () => {} : onCancel}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'default'}
            size="md"
            onClick={onConfirm}
            isLoading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
          variant === 'danger' ? 'bg-red-100' : variant === 'warning' ? 'bg-amber-100' : 'bg-primary-100'
        }`}>
          <AlertTriangle className={`h-6 w-6 ${
            variant === 'danger' ? 'text-red-500' : variant === 'warning' ? 'text-amber-500' : 'text-primary'
          }`} />
        </div>
        <div>
          <h3 className="font-montserrat font-semibold text-slate-900 mb-1">{title}</h3>
          <p className="text-sm text-slate-500 font-roboto leading-relaxed">{message}</p>
        </div>
      </div>
    </Modal>
  );
};

ConfirmDialog.displayName = 'ConfirmDialog';
