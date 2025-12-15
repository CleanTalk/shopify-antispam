require('isomorphic-fetch');
const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const https = require('https');
const Koa = require('koa');
const pg = require('pg')
const next = require('next');
const { default: createShopifyAuth } = require('@shopify/koa-shopify-auth');
const { verifyRequest } = require('@shopify/koa-shopify-auth');
const { default: graphQLProxy } = require('@shopify/koa-shopify-graphql-proxy');
const { ApiVersion } = require('@shopify/koa-shopify-graphql-proxy');
const session = require('koa-session');
const Router = require('koa-router');
const {receiveWebhook, registerWebhook} = require('@shopify/koa-shopify-webhooks');
const requestLib = require('request');
const Shopify = require('shopify-api-node');
//const {Asset, Theme} = require('@shopify/shopify-api');



const config = {
    user: '',
    database: '',
    password: '',
    port: 0
};


const language = 'en';

const port = parseInt(process.env.PORT, 10) || 443;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const { SHOPIFY_API_SECRET_KEY, SHOPIFY_API_KEY, HOST } = process.env;

app.prepare().then(() => {
	const server = new Koa();
	const router = new Router();
  	const pool = new pg.Pool(config);

	server.use(session({ secure: true, sameSite: 'none' }, server));
	server.keys = [SHOPIFY_API_SECRET_KEY];

	server.use( async ( ctx, next ) => {
		try {
			await next();
		} catch( err ) {
			console.log(err);
			ctx.status = 500;
			ctx.body = 'Internal error';
		}
	} );

	server.use(
		createShopifyAuth({
			apiKey: SHOPIFY_API_KEY,
			secret: SHOPIFY_API_SECRET_KEY,
			scopes: ['read_customers', 'write_customers', 'read_orders', 'write_orders', 'read_themes', 'write_themes'],
			async afterAuth(ctx) {
				const { shop, accessToken } = ctx.session;

		        ctx.cookies.set("shopOrigin", shop, {
		          httpOnly: false,
		          secure: true,
		          sameSite: 'none'
		        });
				pool.connect(function (err, client, done) {
					if (err) {
						console.log("Can not connect to the DB" + err);
					}
					client.query("INSERT INTO settings (shopname, accessToken) VALUES ($1, $2) ON CONFLICT (shopname) DO UPDATE SET accessToken = $3;",[shop, accessToken, accessToken], function (err, result) {
					done();
					if (err) {
						console.log(err);
					}
					console.log("accessToken saved for shopname:" + shop + ", token: " + accessToken);
					})
				});
				pool.connect(function (err, client, done) {
					if (err) {
						console.log("Can not connect to the DB" + err);
					}
					client.query("SELECT value FROM settings WHERE shopname = $1 AND value IS NOT NULL;",[shop], function (err, result) {
					done();
					if (err) {
						console.log(err);
					}
					if (result.rows && result.rows.length) {
						ctx.cookies.set("shopOptions", result.rows[0].value, { httpOnly: false , secure: true, sameSite: 'none'});
					}
					})
				});
				const customersWebhookRegistration = await registerWebhook({
					address: `${HOST}/webhooks/customers/create`,
					topic: 'CUSTOMERS_CREATE',
					accessToken,
					shop,
					apiVersion: ApiVersion.July20
				});

				if (customersWebhookRegistration.success) {
					console.log('Successfully registered customers webhook!');
				} else {
					console.log('Failed to register customers webhook', customersWebhookRegistration.result);
				}
				const ordersWebhookRegistration = await registerWebhook({
					address: `${HOST}/webhooks/orders/create`,
					topic: 'ORDERS_CREATE',
					accessToken,
					shop,
					apiVersion: ApiVersion.July20
				});
				if (ordersWebhookRegistration.success) {
					console.log('Successfully registered orders webhook!');
				} else {
					console.log('Failed to register orders webhook', ordersWebhookRegistration.result);
				}
				ctx.redirect('https://'+shop+'/admin/apps/cleantalk');
			},
		}),
	);
	router.post('/webhooks/customers/redact', async (ctx, next) => {
		ctx.res.statusCode = 200;
	});
	router.post('/webhooks/shop/redact', async (ctx, next) => {
		ctx.res.statusCode = 200;
	});
	router.post('/webhooks/customers/data_request', async (ctx, next) => {
		ctx.res.statusCode = 200;
	});
	router.post('/save_settings', async (ctx, next) => {
		ctx.res.statusCode = 200;
		let shopName = ctx.cookies.get('shopOrigin');
		let shopOptions = decodeURI(ctx.cookies.get('shopOptions')).replace(/%2C/g,",");
		if (shopName !== undefined && shopOptions !== undefined && shopOptions !== 'undefined') {
			pool.connect(function (err, client, done) {
				if (err) {
					console.log("Can not connect to the DB" + err);
				}
				client.query("INSERT INTO settings (shopname, value) VALUES ($1, $2) ON CONFLICT (shopname) DO UPDATE SET value = $3;",[shopName, shopOptions, shopOptions], function (err, result) {
				done();
				if (err) {
					console.log(err);
				}
				console.log("Settings saved for shopname:" + shopName + ", value: " + shopOptions);
				})
			});
		}
		else {
		  console.log("Error getting shop name");
		}
	});

  	const webhook = receiveWebhook({ secret: SHOPIFY_API_SECRET_KEY });

	router.post('/webhooks/customers/create', webhook, async (ctx) => {
  		/* handle customers create */
  		//console.log('received webhook: ', ctx.state.webhook);
		pool.connect(function (err, client, done) {
			if (err) {
				console.log("Can not connect to the DB" + err);
			}
			client.query("SELECT value, accessToken FROM settings WHERE shopname = $1;",[ctx.state.webhook.domain], function (err, result) {
				done();
				if (err) {
					console.log(err);
				}
				if (result.rows && result.rows.length && result.rows[0].value !== null) {
					let settings = JSON.parse(result.rows[0].value);
					let accessToken = result.rows[0].accesstoken;
					if (settings.apiKey !== null && settings.checkReg == true)
					{
						var params = {
							agent: 'shopify-10',
							method_name: 'check_newuser',
							auth_key: settings.apiKey,
							sender_email: ctx.request.body.email,
							sender_nickname: ctx.request.body.first_name + " " + ctx.request.body.last_name,
							all_headers: JSON.stringify(ctx.request.header),
							js_on: 1
						};
						requestLib({
						    uri: "https://moderate.cleantalk.org/api2.0",
						    method: "POST",
						    body: params,
						    json: true
						}, function (error, response, body){
							if (response.body.allow == 0) {
								const shopify = new Shopify({
								  shopName: ctx.state.webhook.domain,
								  accessToken: accessToken
								});
								console.log("Registration removed:\nCustomerID: "+ctx.request.body.id+"\nResponse: "+response.body.comment+"\n");
								shopify.customer.delete(ctx.request.body.id).then(response => console.log("-- Customer "+ctx.request.body.id+" removed --")).catch((err) => console.error(err));
							}

						});
					}
				}
			})
		});



	});
	router.post('/webhooks/orders/create', webhook, (ctx) => {
  		/* handle orders create */
  		//console.log('received webhook: ', ctx.state.webhook);

		pool.connect(function (err, client, done) {
			if (err) {
				console.log("Can not connect to the DB" + err);
			}
			client.query("SELECT value, accessToken FROM settings WHERE shopname = $1;",[ctx.state.webhook.domain], function (err, result) {
				done();
				if (err) {
					console.log(err);
				}
				console.log(result.rows.value);
				if (result.rows && result.rows.length && result.rows[0].value !== null ) {
					let settings = JSON.parse(result.rows[0].value);
					let accessToken = result.rows[0].accesstoken;
					if (settings.apiKey !== null && settings.checkOrders)
					{
						var sender_email = ""
						var sender_nickname = ""
						if (ctx.request.body.customer !== null) {
							if (ctx.request.body.customer.email !== null) {
								sender_email = ctx.request.body.customer.email;
							}
							if (ctx.request.body.first_name !== null && ctx.request.body.last_name !== null) {
								sender_nickname = ctx.request.body.first_name +" " + ctx.request.body.customer.last_name;
							}
						}
						else {
							if (ctx.request.body.email !== null) {
								sender_email = ctx.request.body.email;
							}
						}
						var params = {
							agent: 'shopify-10',
							method_name: 'check_newuser',
							auth_key: settings.apiKey,
							sender_email: sender_email,
							sender_nickname: sender_nickname,
							sender_ip: ctx.request.body.browser_ip,
							js_on: 1
						};
						requestLib({
						    uri: "https://moderate.cleantalk.org/api2.0",
						    method: "POST",
						    body: params,
						    json: true
						}, function (error, response, body){
							if (response.body.allow == 0) {
								const shopify = new Shopify({
								  shopName: ctx.state.webhook.domain,
								  accessToken: accessToken
								});
								console.log("Order removed:\nCustomerID: "+ctx.request.body.customer.id+"\nOrderID: "+ctx.request.body.id+"\nResponse: "+response.body.comment+"\n");
								shopify.order.delete(ctx.request.body.id).then(response => console.log("-- Order "+ctx.request.body.id+" removed --")).catch((err) => console.error(err));
							}

						});
					}
				}

			})
		});
	});
	router.get('/account/register', async(ctx) => {

	});

	server.use(graphQLProxy({ version: ApiVersion.July20 }));

	router.get('(.*)', verifyRequest(), async (ctx) => {
		await handle(ctx.req, ctx.res);
		ctx.respond = false;
		ctx.res.statusCode = 200;
	});

	server.use(router.allowedMethods());
	server.use(router.routes());

	https.createServer({key: fs.readFileSync('cleantalk.org.key'), cert: fs.readFileSync('cleantalk.org.crt')}, server.callback()).listen(port, () => {
		console.log(`> Ready on :${port}`);
  	});
});
