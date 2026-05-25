import React, { useState, useRef, useEffect } from 'react';

const LazyImage = React.memo(({ src, alt, className, fallback = null }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className={className}>
      {isInView && src && !error ? (
        <img
          src={src}
          alt={alt}
          className={`transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setIsLoaded(true)}
          onError={() => setError(true)}
        />
      ) : error || !src ? (
        fallback || <div className="bg-gray-200 animate-pulse rounded"></div>
      ) : (
        <div className="bg-gray-200 animate-pulse rounded"></div>
      )}
    </div>
  );
});

LazyImage.displayName = 'LazyImage';

export default LazyImage;