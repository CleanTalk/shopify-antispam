import App from 'next/app';
import Head from 'next/head';
import React from 'react';
import ReactDOM from 'react-dom';
import { AppProvider } from '@shopify/polaris';
import '@shopify/polaris/dist/styles.css';

class CleantalkApp extends App {
  render() {
    const { Component, pageProps } = this.props;
    return (
      <React.Fragment>
        <Head>
          <title>Cleantalk App</title>
          <meta charSet="utf-8" />
        </Head>
        <AppProvider>
          <Component {...pageProps} />
        </AppProvider>
      </React.Fragment>
    );
  }
}

export default CleantalkApp;
