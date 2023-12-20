import React from 'react';
import ReactDOM from 'react-dom';
import {
  AppProvider,
  Frame,
  Checkbox,
  Button,
  Card,
  Form,
  FormLayout,
  Layout,
  Page,
  TextField,
  Link,
  Toast,
  Stack
} from '@shopify/polaris';
import Cookies from "js-cookie";

class AnnotatedLayout extends React.Component {
  state = {
    apiKey: (Cookies.get('shopOptions')) ? JSON.parse(Cookies.get('shopOptions')).apiKey : '',
    checkReg: (Cookies.get('shopOptions')) ? JSON.parse(Cookies.get('shopOptions')).checkReg : false,
    checkOrders: (Cookies.get('shopOptions')) ? JSON.parse(Cookies.get('shopOptions')).checkOrders : false,
    showToast : false
  };

  render() {
    var { apiKey, checkReg, checkOrders, showToast } = this.state;
    const toastMarkup = showToast ? (
      <Toast content="Settings saved!!!" onDismiss={this.hideToast}/>
    ) : null;
    return (
      <AppProvider>
      <Frame>
      <Page>
        <Layout>
          <Layout.AnnotatedSection
            title="Settings"
            description="Manage your Cleantalk settings."
          >
            <Card sectioned>
              <Form onSubmit={this.handleSubmit}>
                <FormLayout>
                  <TextField
                    id="apiKey"
                    value={apiKey}
                    onChange={this.handleChange('apiKey')}
                    label="API key"
                    helpText={<p>Click <Link url="https://cleantalk.org/register?platform=shopify" external={true}>here</Link> to get an access key</p>}
                  />
            <Checkbox
              id="checkReg"
              checked={checkReg}
              label="Check registrations"
              onChange={this.handleChange('checkReg')}
            />    
            <Checkbox
              id="checkOrders"
              checked={checkOrders}
              label="Check orders"
              onChange={this.handleChange('checkOrders')}
            />                          
                  <Stack distribution="trailing">
                    <Button primary submit onClick={this.toggleToast}>
                      Save
                    </Button>                  
                  </Stack>
                </FormLayout>
                {toastMarkup}
              </Form>
            </Card>
          </Layout.AnnotatedSection>
        </Layout>
      </Page>
      </Frame>
      </AppProvider>
    );
  }
  hideToast = () => {
    this.setState(({showToast}) => ({showToast: !showToast}));
  }
  handleSubmit = (e) => {
      const data = new FormData(e.target);
      fetch('/save_settings', {
        method: 'POST',
        body: JSON.stringify({apiKey: this.state.apiKey, checkReg: this.state.checkReg, checkOrders: this.state.checkOrders}),
      });
      Cookies.set('shopOptions', JSON.stringify({apiKey: this.state.apiKey, checkReg: this.state.checkReg, checkOrders: this.state.checkOrders}), {secure: true, httpOnly: false, sameSite: 'none'});
      this.setState(({showToast}) => ({showToast: !showToast}));
  }

  handleChange = (field) => {
    return (value) => this.setState({ [field]: value });
  };
}

export default AnnotatedLayout;