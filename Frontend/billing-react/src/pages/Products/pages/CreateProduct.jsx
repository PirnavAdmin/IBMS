import React, { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Breadcrumbs, Button } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { productService } from '../services/productService';
import { ProductForm } from '../components/ProductForm';
import '../styles/product-form.css';

export function CreateProduct() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const requestLock = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async (formData) => {
    if (requestLock.current) return;
    requestLock.current = true;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      await productService.createProduct(formData);
      await queryClient.invalidateQueries({ queryKey: ['products'], refetchType: 'none' });
      navigate('/products', {
        replace: true,
        state: { productNotice: `Product "${formData.name}" created successfully.` },
      });
    } catch (err) {
      requestLock.current = false;
      setSubmitError(err.message || 'Failed to create product. Please check your entries.');
      setIsSubmitting(false);
    }
  };

  return (
    <main className="product-page">
      <Breadcrumbs aria-label="Breadcrumb">
        <Link to="/products">Products &amp; Services</Link>
        <span>Add New Product</span>
      </Breadcrumbs>

      <header className="product-heading">
        <div>
          <span className="product-eyebrow">YOUR BILLING CATALOG</span>
          <h1>Add New Product</h1>
          <p>Create a product with pricing, tax and billing details.</p>
        </div>
        <Button
          component={Link}
          to="/products"
          variant="outlined"
          startIcon={<ArrowBack />}
        >
          Back to Products
        </Button>
      </header>

      <ProductForm
        mode="create"
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        submitError={submitError}
        onCancel={() => navigate('/products')}
      />
    </main>
  );
}

export default CreateProduct;
