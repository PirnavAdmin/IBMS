import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconButton, ListItemIcon, Menu, MenuItem, Tooltip } from '@mui/material';
import { EditOutlined, MoreVert, VisibilityOutlined } from '@mui/icons-material';

export function ProductActionItems({ product, onSelect }) {
  return [
    <MenuItem key="view" component={Link} to={`/products/${encodeURIComponent(product.id)}`} onClick={onSelect}><ListItemIcon><VisibilityOutlined fontSize="small" /></ListItemIcon>View</MenuItem>,
    <MenuItem key="edit" component={Link} to={`/products/${encodeURIComponent(product.id)}/edit`} onClick={onSelect}><ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon>Edit</MenuItem>,
  ];
}

export function ProductActionsMenu({ product }) {
  const [anchor, setAnchor] = useState(null);
  const menuId = `product-actions-${product.id}`;
  const close = () => setAnchor(null);
  return <div className="product-row-actions" role="group" aria-label={`Actions for ${product.name}`}>
    <Tooltip title="Product actions"><IconButton id={`${menuId}-button`} size="small" className="product-action-overflow"
      aria-label={`Actions for ${product.name}`} aria-haspopup="menu" aria-expanded={Boolean(anchor)}
      aria-controls={anchor ? menuId : undefined} onClick={event => setAnchor(event.currentTarget)}><MoreVert fontSize="small" /></IconButton></Tooltip>
    <Menu id={menuId} anchorEl={anchor} open={Boolean(anchor)} onClose={close}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      PaperProps={{ className: 'product-actions-menu' }} MenuListProps={{ 'aria-labelledby': `${menuId}-button` }}>
      {ProductActionItems({ product, onSelect: close })}
    </Menu>
  </div>;
}
